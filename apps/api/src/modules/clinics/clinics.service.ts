import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { ClinicStatus, Prisma } from '@prisma/client';
import type { ContactMessageInput, RegisterClinicInput, ReviewClinicInput, UpdateClinicInput } from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import { BillingService } from '../billing/billing.service';
import { NotificationsService } from '../notifications/notifications.service';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'clinic'}-${randomBytes(3).toString('hex')}`;
}

const CLINIC_PUBLIC_FIELDS = {
  id: true,
  name: true,
  slug: true,
  status: true,
  statusReason: true,
  city: true,
  subCity: true,
  addressLine: true,
  phone: true,
  email: true,
  licenseNumber: true,
  timezone: true,
  defaultAppointmentMinutes: true,
  reminderHoursBefore: true,
  aiExternalProcessingApproved: true,
  approvedAt: true,
  createdAt: true,
} satisfies Prisma.ClinicSelect;

@Injectable()
export class ClinicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async register(input: RegisterClinicInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.admin.email } });
    if (existing) {
      throw Errors.conflict('EMAIL_IN_USE', 'An account with this email already exists. Sign in to add a clinic.');
    }
    const passwordHash = await this.passwords.hash(input.admin.password);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.admin.email,
          passwordHash,
          firstName: input.admin.firstName,
          lastName: input.admin.lastName,
          phone: input.admin.phone,
        },
      });
      const { planCode, ...clinicData } = input.clinic;
      const clinic = await tx.clinic.create({
        data: { ...clinicData, slug: slugify(clinicData.name), status: 'PENDING_APPROVAL' },
      });
      await tx.clinicMembership.create({
        data: { clinicId: clinic.id, userId: user.id, role: 'CLINIC_ADMIN', status: 'ACTIVE' },
      });
      await this.billing.startTrial(clinic.id, planCode, tx);
      await this.audit.log(
        { clinicId: clinic.id, actorUserId: user.id, action: 'clinic.registered', entityType: 'Clinic', entityId: clinic.id },
        tx,
      );
      return { clinicId: clinic.id, status: clinic.status, adminUserId: user.id };
    });

    const admins = await this.prisma.userRole.findMany({ where: { role: { key: 'PLATFORM_ADMIN' } }, select: { userId: true } });
    await this.notifications.notifyUsers(
      admins.map((a) => a.userId),
      {
        type: 'SYSTEM',
        title: 'New clinic registration',
        body: `${input.clinic.name} (${input.clinic.city}) is awaiting approval.`,
        link: '/admin/clinics',
      },
    );
    return result;
  }

  async get(clinicId: string) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, deletedAt: null }, select: CLINIC_PUBLIC_FIELDS });
    if (!clinic) throw Errors.notFound('Clinic');
    return clinic;
  }

  async update(clinicId: string, actorUserId: string, input: UpdateClinicInput) {
    const clinic = await this.prisma.clinic.update({ where: { id: clinicId }, data: input, select: CLINIC_PUBLIC_FIELDS });
    await this.audit.log({
      clinicId,
      actorUserId,
      action: 'clinic.updated',
      entityType: 'Clinic',
      entityId: clinicId,
      metadata: { fields: Object.keys(input) },
    });
    return clinic;
  }

  // ───────── Platform administration ─────────

  async listForPlatform(status?: ClinicStatus) {
    return this.prisma.clinic.findMany({
      where: { deletedAt: null, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        ...CLINIC_PUBLIC_FIELDS,
        _count: { select: { patients: true, memberships: true } },
        subscriptions: { where: { isCurrent: true }, select: { status: true, plan: { select: { code: true, name: true } } } },
      },
    });
  }

  async review(clinicId: string, actorUserId: string, input: ReviewClinicInput) {
    const clinic = await this.prisma.clinic.findFirst({ where: { id: clinicId, deletedAt: null } });
    if (!clinic) throw Errors.notFound('Clinic');
    const transitions: Record<ReviewClinicInput['decision'], { from: ClinicStatus[]; to: ClinicStatus }> = {
      APPROVE: { from: ['PENDING_APPROVAL'], to: 'ACTIVE' },
      REJECT: { from: ['PENDING_APPROVAL'], to: 'REJECTED' },
      SUSPEND: { from: ['ACTIVE'], to: 'SUSPENDED' },
      REACTIVATE: { from: ['SUSPENDED'], to: 'ACTIVE' },
    };
    const t = transitions[input.decision];
    if (!t.from.includes(clinic.status)) {
      throw Errors.conflict('INVALID_TRANSITION', `Cannot ${input.decision.toLowerCase()} a clinic that is ${clinic.status}`);
    }
    const updated = await this.prisma.clinic.update({
      where: { id: clinicId },
      data: {
        status: t.to,
        statusReason: input.reason ?? null,
        ...(input.decision === 'APPROVE' ? { approvedAt: new Date() } : {}),
      },
      select: CLINIC_PUBLIC_FIELDS,
    });
    await this.audit.log({
      clinicId,
      actorUserId,
      action: `clinic.${input.decision.toLowerCase()}`,
      entityType: 'Clinic',
      entityId: clinicId,
      metadata: { from: clinic.status, to: t.to },
    });
    const admins = await this.prisma.clinicMembership.findMany({
      where: { clinicId, role: 'CLINIC_ADMIN', status: 'ACTIVE', deletedAt: null },
      select: { userId: true },
    });
    await this.notifications.notifyUsers(
      admins.map((a) => a.userId),
      {
        clinicId,
        type: 'SYSTEM',
        title: `Clinic ${t.to === 'ACTIVE' ? 'activated' : t.to.toLowerCase()}`,
        body:
          t.to === 'ACTIVE'
            ? `${clinic.name} is now active on AfyaLink AI.`
            : `${clinic.name} status changed to ${t.to}.${input.reason ? ` Reason: ${input.reason}` : ''}`,
        link: '/app/overview',
      },
    );
    return updated;
  }

  async platformOverview() {
    const [clinics, pending, users, patients, appointments30d, openTickets] = await Promise.all([
      this.prisma.clinic.count({ where: { deletedAt: null } }),
      this.prisma.clinic.count({ where: { deletedAt: null, status: 'PENDING_APPROVAL' } }),
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.patient.count({ where: { deletedAt: null } }),
      this.prisma.appointment.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      this.prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    ]);
    return { clinics, pendingClinics: pending, users, patients, appointmentsLast30Days: appointments30d, openTickets };
  }

  async submitContact(input: ContactMessageInput): Promise<void> {
    await this.prisma.contactMessage.create({ data: input });
  }
}
