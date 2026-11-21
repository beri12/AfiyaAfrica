import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import type { NotificationPreferenceInput, PaginationQuery } from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { paginate, skipTake } from '../../common/http/pagination';
import { QUEUES, type DeliverNotificationJob } from '../jobs/queues';
import { EmailProvider, SmsProvider } from './providers';

export interface NotificationContent {
  clinicId?: string | null;
  type: NotificationType;
  /** Must not contain clinical details — notifications may be shown on lock screens or SMS. */
  title: string;
  body: string;
  link?: string;
}

/** Default channel opt-ins when a user has not set a preference. */
const DEFAULT_ENABLED: Record<NotificationChannel, boolean> = { IN_APP: true, EMAIL: true, SMS: false };

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.notifications) private readonly queue: Queue<DeliverNotificationJob>,
    private readonly email: EmailProvider,
    private readonly sms: SmsProvider,
  ) {}

  /** Notifies platform users (staff or patients with portal accounts) per their channel preferences. */
  async notifyUsers(userIds: string[], content: NotificationContent): Promise<void> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return;
    const prefs = await this.prisma.notificationPreference.findMany({
      where: { userId: { in: unique }, type: content.type },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique }, deletedAt: null },
      select: { id: true, email: true, phone: true },
    });
    const toDeliver: string[] = [];
    for (const user of users) {
      for (const channel of ['IN_APP', 'EMAIL', 'SMS'] as const) {
        const pref = prefs.find((p) => p.userId === user.id && p.channel === channel);
        const enabled = pref ? pref.enabled : DEFAULT_ENABLED[channel];
        if (!enabled) continue;
        if (channel === 'SMS' && !user.phone) continue;
        const n = await this.prisma.notification.create({
          data: {
            clinicId: content.clinicId ?? null,
            userId: user.id,
            type: content.type,
            channel,
            title: content.title,
            body: content.body,
            link: content.link,
            deliveryStatus: channel === 'IN_APP' ? 'SENT' : 'QUEUED',
            sentAt: channel === 'IN_APP' ? new Date() : null,
          },
        });
        if (channel !== 'IN_APP') toDeliver.push(n.id);
      }
    }
    await this.enqueue(toDeliver);
  }

  /**
   * Notifies a patient. In-app if they have a portal account; SMS/email only with recorded consent, a contact
   * detail and (for SMS) a plan that includes SMS reminders.
   */
  async notifyPatient(patientId: string, content: NotificationContent & { clinicId: string }): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId: content.clinicId, deletedAt: null },
      select: { id: true, userId: true, phone: true, email: true },
    });
    if (!patient) return;

    if (patient.userId) {
      await this.prisma.notification.create({
        data: {
          clinicId: content.clinicId,
          userId: patient.userId,
          type: content.type,
          channel: 'IN_APP',
          title: content.title,
          body: content.body,
          link: content.link,
          deliveryStatus: 'SENT',
          sentAt: new Date(),
        },
      });
    }

    const consents = await this.effectiveConsents(patientId);
    const plan = await this.prisma.subscription.findFirst({
      where: { clinicId: content.clinicId, isCurrent: true },
      select: { plan: { select: { smsReminders: true } } },
    });
    const toDeliver: string[] = [];
    const add = async (channel: 'SMS' | 'EMAIL') => {
      const n = await this.prisma.notification.create({
        data: {
          clinicId: content.clinicId,
          recipientPatientId: patient.id,
          type: content.type,
          channel,
          title: content.title,
          body: content.body,
          deliveryStatus: 'QUEUED',
        },
      });
      toDeliver.push(n.id);
    };
    if (patient.phone && consents.SMS_REMINDERS && plan?.plan.smsReminders) await add('SMS');
    if (patient.email && consents.EMAIL_REMINDERS) await add('EMAIL');
    await this.enqueue(toDeliver);
  }

  async effectiveConsents(patientId: string): Promise<Record<string, boolean>> {
    const rows = await this.prisma.patientConsent.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, granted: true },
    });
    const out: Record<string, boolean> = {};
    for (const r of rows) out[r.type] = r.granted; // latest wins
    return out;
  }

  private async enqueue(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.queue.addBulk(
        ids.map((notificationId) => ({
          name: 'deliver',
          data: { notificationId },
          opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
        })),
      );
    } catch (e) {
      // The rows stay QUEUED; a maintenance sweep re-enqueues them.
      this.logger.error(`Failed to enqueue ${ids.length} notifications: ${(e as Error).message}`);
    }
  }

  /** Delivers one SMS/email notification. Called by the queue worker. */
  async deliver(notificationId: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: { select: { email: true, phone: true } } },
    });
    if (!n || n.deliveryStatus !== 'QUEUED') return;
    let to: string | null | undefined;
    if (n.userId) to = n.channel === 'EMAIL' ? n.user?.email : n.user?.phone;
    else if (n.recipientPatientId) {
      const p = await this.prisma.patient.findUnique({ where: { id: n.recipientPatientId }, select: { email: true, phone: true } });
      to = n.channel === 'EMAIL' ? p?.email : p?.phone;
    }
    if (!to) {
      await this.mark(n.id, 'SKIPPED', 'NO_CONTACT_DETAIL');
      return;
    }
    const result =
      n.channel === 'EMAIL'
        ? await this.email.send(to, n.title, `${n.body}\n\n— AfyaLink AI`)
        : await this.sms.send(to, `${n.title}: ${n.body}`.slice(0, 459));
    if (result.ok) await this.mark(n.id, 'SENT');
    else if (result.skipped) await this.mark(n.id, 'SKIPPED', result.error);
    else {
      await this.mark(n.id, 'QUEUED', result.error);
      throw new Error(result.error ?? 'Delivery failed'); // let BullMQ retry
    }
  }

  async markFailed(notificationId: string, error: string): Promise<void> {
    await this.mark(notificationId, 'FAILED', error);
  }

  private async mark(id: string, status: 'SENT' | 'SKIPPED' | 'FAILED' | 'QUEUED', error?: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { deliveryStatus: status, deliveryError: error ?? null, sentAt: status === 'SENT' ? new Date() : undefined },
    });
  }

  /** Re-enqueues notifications stuck in QUEUED (e.g. Redis was briefly unavailable). */
  async requeueStale(olderThanMinutes = 15): Promise<number> {
    const stale = await this.prisma.notification.findMany({
      where: { deliveryStatus: 'QUEUED', channel: { not: 'IN_APP' }, createdAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
      select: { id: true },
      take: 500,
    });
    await this.enqueue(stale.map((s) => s.id));
    return stale.length;
  }

  // ───────── In-app inbox ─────────

  async list(userId: string, q: PaginationQuery & { unreadOnly?: boolean }) {
    const where: Prisma.NotificationWhereInput = { userId, channel: 'IN_APP', ...(q.unreadOnly ? { readAt: null } : {}) };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true, clinicId: true },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, channel: 'IN_APP', readAt: null } }),
    ]);
    const page = paginate(items, total, q);
    return Object.assign(page, { meta: { ...page.meta, unread } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const res = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (res.count === 0) {
      const exists = await this.prisma.notification.count({ where: { id, userId } });
      if (!exists) throw Errors.notFound('Notification');
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { userId, channel: 'IN_APP', readAt: null }, data: { readAt: new Date() } });
  }

  async getPreferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    return {
      defaults: DEFAULT_ENABLED,
      preferences: rows.map((r) => ({ type: r.type, channel: r.channel, enabled: r.enabled })),
      channelsConfigured: { EMAIL: this.email.configured, SMS: this.sms.configured, IN_APP: true },
    };
  }

  async setPreferences(userId: string, input: NotificationPreferenceInput) {
    await this.prisma.$transaction(
      input.preferences.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { userId_type_channel: { userId, type: p.type, channel: p.channel } },
          create: { userId, type: p.type, channel: p.channel, enabled: p.enabled },
          update: { enabled: p.enabled },
        }),
      ),
    );
    return this.getPreferences(userId);
  }
}
