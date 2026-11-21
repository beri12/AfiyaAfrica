import { Injectable, Logger } from '@nestjs/common';
import type { Plan, PlanCode } from '@prisma/client';
import { TRIAL_DAYS } from '@afyalink/shared';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { AuditService } from '../audit/audit.service';
import { PaymentProvider } from './payment.provider';

const DAY = 86_400_000;

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentProvider,
  ) {}

  /** Creates the trial subscription for a newly registered clinic. */
  async startTrial(clinicId: string, planCode: PlanCode, tx: Tx): Promise<void> {
    const plan = await tx.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.active) throw Errors.badRequest('PLAN_UNAVAILABLE', 'Selected plan is not available');
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY);
    await tx.subscription.create({
      data: {
        clinicId,
        planId: plan.id,
        status: 'TRIALING',
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
      },
    });
  }

  async currentPlan(clinicId: string, tx?: Tx): Promise<Plan> {
    const sub = await (tx ?? this.prisma).subscription.findFirst({
      where: { clinicId, isCurrent: true },
      include: { plan: true },
    });
    if (!sub) throw Errors.forbidden('This clinic has no active subscription');
    if (sub.status === 'CANCELLED') throw Errors.planLimit('The clinic subscription is cancelled');
    return sub.plan;
  }

  async assertStaffCapacity(clinicId: string, tx?: Tx): Promise<void> {
    const plan = await this.currentPlan(clinicId, tx);
    if (plan.maxStaff === null) return;
    const count = await (tx ?? this.prisma).clinicMembership.count({
      where: { clinicId, deletedAt: null, status: { not: 'DISABLED' }, role: { not: 'PATIENT' } },
    });
    if (count >= plan.maxStaff) {
      throw Errors.planLimit(`Your ${plan.name} plan allows up to ${plan.maxStaff} staff accounts. Upgrade to add more.`);
    }
  }

  async assertPatientCapacity(clinicId: string, tx?: Tx): Promise<void> {
    const plan = await this.currentPlan(clinicId, tx);
    if (plan.maxPatients === null) return;
    const count = await (tx ?? this.prisma).patient.count({ where: { clinicId, deletedAt: null } });
    if (count >= plan.maxPatients) {
      throw Errors.planLimit(`Your ${plan.name} plan allows up to ${plan.maxPatients} patients. Upgrade to add more.`);
    }
  }

  async assertFeature(clinicId: string, feature: 'ai' | 'sms'): Promise<boolean> {
    const plan = await this.currentPlan(clinicId);
    return feature === 'ai' ? plan.aiEnabled : plan.smsReminders;
  }

  async listPlans() {
    return this.prisma.plan.findMany({ where: { active: true }, orderBy: { monthlyPriceUsdCents: 'asc' } });
  }

  async getSubscription(clinicId: string) {
    const [current, history, usage] = await Promise.all([
      this.prisma.subscription.findFirst({ where: { clinicId, isCurrent: true }, include: { plan: true } }),
      this.prisma.subscription.findMany({
        where: { clinicId },
        include: { plan: { select: { code: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      Promise.all([
        this.prisma.clinicMembership.count({
          where: { clinicId, deletedAt: null, status: { not: 'DISABLED' }, role: { not: 'PATIENT' } },
        }),
        this.prisma.patient.count({ where: { clinicId, deletedAt: null } }),
      ]),
    ]);
    return { current, history, usage: { staff: usage[0], patients: usage[1] }, paymentMode: this.payments.mode };
  }

  /** Switches plan: closes the current subscription row (history kept) and opens a new one. */
  async changePlan(clinicId: string, actorUserId: string, planCode: PlanCode) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findFirst({ where: { clinicId, isCurrent: true }, include: { plan: true } });
      if (!current) throw Errors.notFound('Subscription');
      if (current.plan.code === planCode) throw Errors.conflict('SAME_PLAN', 'The clinic is already on this plan');
      const plan = await tx.plan.findUnique({ where: { code: planCode } });
      if (!plan || !plan.active) throw Errors.badRequest('PLAN_UNAVAILABLE', 'Selected plan is not available');

      // Downgrade guard: current usage must fit the new plan.
      const [staff, patients] = await Promise.all([
        tx.clinicMembership.count({
          where: { clinicId, deletedAt: null, status: { not: 'DISABLED' }, role: { not: 'PATIENT' } },
        }),
        tx.patient.count({ where: { clinicId, deletedAt: null } }),
      ]);
      if ((plan.maxStaff !== null && staff > plan.maxStaff) || (plan.maxPatients !== null && patients > plan.maxPatients)) {
        throw Errors.conflict('PLAN_TOO_SMALL', 'Current staff or patient counts exceed the limits of the selected plan');
      }

      await tx.subscription.update({ where: { id: current.id }, data: { isCurrent: false, cancelledAt: new Date() } });
      const now = new Date();
      const inTrial = current.status === 'TRIALING' && current.trialEndsAt && current.trialEndsAt > now;
      const created = await tx.subscription.create({
        data: {
          clinicId,
          planId: plan.id,
          status: inTrial ? 'TRIALING' : 'ACTIVE',
          trialEndsAt: inTrial ? current.trialEndsAt : null,
          currentPeriodStart: now,
          currentPeriodEnd: inTrial && current.trialEndsAt ? current.trialEndsAt : addMonths(now, 1),
        },
        include: { plan: true },
      });
      await this.audit.log(
        {
          clinicId,
          actorUserId,
          action: 'subscription.plan_changed',
          entityType: 'Subscription',
          entityId: created.id,
          metadata: { from: current.plan.code, to: plan.code },
        },
        tx,
      );
      return created;
    });
  }

  /**
   * Issues invoices for subscriptions whose period has ended, advancing the period. Idempotent thanks to the
   * (subscriptionId, periodStart) unique constraint. Runs daily from the maintenance queue.
   */
  async generateDueInvoices(now = new Date()): Promise<number> {
    const due = await this.prisma.subscription.findMany({
      where: { isCurrent: true, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] }, currentPeriodEnd: { lte: now } },
      include: { plan: true },
    });
    let issued = 0;
    for (const sub of due) {
      const periodStart = sub.currentPeriodEnd;
      const periodEnd = addMonths(periodStart, 1);
      try {
        await this.prisma.$transaction(async (tx) => {
          const count = await tx.invoice.count();
          await tx.invoice.create({
            data: {
              clinicId: sub.clinicId,
              subscriptionId: sub.id,
              number: `AFY-${periodStart.getUTCFullYear()}-${String(count + 1).padStart(6, '0')}`,
              amountUsdCents: sub.plan.monthlyPriceUsdCents,
              periodStart,
              periodEnd,
              dueDate: new Date(periodStart.getTime() + 14 * DAY),
            },
          });
          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: sub.status === 'TRIALING' ? 'ACTIVE' : sub.status,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
            },
          });
        });
        issued++;
      } catch (e) {
        this.logger.warn(`Invoice generation skipped for subscription ${sub.id}: ${(e as Error).message}`);
      }
    }
    // Overdue invoices move the subscription to PAST_DUE.
    await this.prisma.subscription.updateMany({
      where: { isCurrent: true, status: 'ACTIVE', invoices: { some: { status: 'OPEN', dueDate: { lt: now } } } },
      data: { status: 'PAST_DUE' },
    });
    return issued;
  }

  async listInvoices(clinicId: string) {
    return this.prisma.invoice.findMany({
      where: { clinicId },
      orderBy: { createdAt: 'desc' },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
      take: 50,
    });
  }

  async payInvoice(clinicId: string, invoiceId: string, actorUserId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, clinicId } });
    if (!invoice) throw Errors.notFound('Invoice');
    if (invoice.status !== 'OPEN') throw Errors.conflict('INVOICE_NOT_OPEN', 'Only open invoices can be paid');

    const result = await this.payments.charge({ invoiceId, amountUsdCents: invoice.amountUsdCents, currency: invoice.currency });
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId,
          provider: this.payments.name,
          sandbox: this.payments.mode === 'sandbox',
          providerReference: result.reference,
          amountUsdCents: invoice.amountUsdCents,
          status: result.status,
          failureReason: result.failureReason,
        },
      });
      if (result.status === 'SUCCEEDED') {
        await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID', paidAt: new Date() } });
        const openLeft = await tx.invoice.count({ where: { subscriptionId: invoice.subscriptionId, status: 'OPEN' } });
        if (openLeft === 0) {
          await tx.subscription.updateMany({
            where: { id: invoice.subscriptionId, status: 'PAST_DUE' },
            data: { status: 'ACTIVE' },
          });
        }
      }
      await this.audit.log(
        {
          clinicId,
          actorUserId,
          action: 'invoice.payment_attempted',
          entityType: 'Invoice',
          entityId: invoiceId,
          metadata: { status: result.status, sandbox: this.payments.mode === 'sandbox' },
        },
        tx,
      );
      return payment;
    });
  }
}
