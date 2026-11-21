import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { AppointmentStatus, Prisma } from '@prisma/client';
import {
  MAX_BOOKING_HORIZON_DAYS,
  type AppointmentListQuery,
  type AppointmentSlot,
  type CancelAppointmentInput,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
} from '@afyalink/shared';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { paginate, skipTake } from '../../common/http/pagination';
import type { TenantContext } from '../../common/decorators/access';
import { zonedDateString, zonedDayBounds, zonedParts, zonedToUtc } from '../../common/time';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { appointmentReminderJobId, QUEUES, type AppointmentReminderJob } from '../jobs/queues';

const ACTIVE: AppointmentStatus[] = ['PENDING', 'CONFIRMED'];
/** Staff may record walk-ins that started a little earlier. */
const PAST_TOLERANCE_MS = 15 * 60_000;

export const APPOINTMENT_SELECT = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  reason: true,
  cancellationReason: true,
  bookedByPatient: true,
  createdAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, medicalRecordNumber: true, phone: true } },
  doctor: { select: { id: true, specialty: true, membership: { select: { user: { select: { id: true, firstName: true, lastName: true } } } } } },
  service: { select: { id: true, name: true, durationMinutes: true } },
} satisfies Prisma.AppointmentSelect;

export function formatLocal(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

interface BookingRequest {
  patientId: string;
  doctorId: string;
  serviceId: string;
  startAt: Date;
  durationMinutes?: number;
  excludeAppointmentId?: string;
}

const TRANSITIONS: Record<'confirm' | 'complete' | 'no-show', { from: AppointmentStatus[]; to: AppointmentStatus; requireStarted: boolean }> = {
  confirm: { from: ['PENDING'], to: 'CONFIRMED', requireStarted: false },
  complete: { from: ['CONFIRMED'], to: 'COMPLETED', requireStarted: true },
  'no-show': { from: ['CONFIRMED'], to: 'NO_SHOW', requireStarted: true },
};

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    @InjectQueue(QUEUES.reminders) private readonly reminders: Queue<AppointmentReminderJob>,
  ) {}

  /** Validates a booking against clinic data, doctor availability and existing appointments. */
  async validateBooking(clinicId: string, tz: string, req: BookingRequest, db: Tx | PrismaService = this.prisma) {
    const now = Date.now();
    if (Number.isNaN(req.startAt.getTime())) throw Errors.badRequest('INVALID_TIME', 'Invalid start time');
    if (req.startAt.getTime() < now - PAST_TOLERANCE_MS) {
      throw Errors.unprocessable('TIME_IN_PAST', 'Appointments cannot be booked in the past');
    }
    if (req.startAt.getTime() > now + MAX_BOOKING_HORIZON_DAYS * 86_400_000) {
      throw Errors.unprocessable('TOO_FAR_AHEAD', `Appointments can be booked up to ${MAX_BOOKING_HORIZON_DAYS} days ahead`);
    }

    const [service, doctor, patient] = await Promise.all([
      db.clinicService.findFirst({ where: { id: req.serviceId, clinicId, active: true, deletedAt: null } }),
      db.doctorProfile.findFirst({
        where: { id: req.doctorId, clinicId, membership: { status: 'ACTIVE', deletedAt: null, role: 'DOCTOR' } },
        include: { availability: true, membership: { select: { userId: true } } },
      }),
      db.patient.findFirst({ where: { id: req.patientId, clinicId, deletedAt: null } }),
    ]);
    if (!service) throw Errors.notFound('Service');
    if (!doctor) throw Errors.notFound('Doctor');
    if (!patient) throw Errors.notFound('Patient');
    if (patient.status !== 'ACTIVE') throw Errors.unprocessable('PATIENT_INACTIVE', 'Patient is not active');

    const duration = req.durationMinutes ?? service.durationMinutes;
    const endAt = new Date(req.startAt.getTime() + duration * 60_000);

    // Must fit entirely inside one availability window on the clinic-local day.
    const startLocal = zonedParts(req.startAt, tz);
    const startMin = startLocal.hour * 60 + startLocal.minute;
    const endMin = startMin + duration;
    const fits = doctor.availability.some(
      (w) => w.dayOfWeek === startLocal.dayOfWeek && startMin >= w.startMinute && endMin <= w.endMinute,
    );
    if (!fits) {
      throw Errors.unprocessable('OUTSIDE_AVAILABILITY', "The selected time is outside the doctor's working hours");
    }

    const overlap = (field: 'doctorId' | 'patientId', id: string) =>
      db.appointment.findFirst({
        where: {
          clinicId,
          [field]: id,
          status: { in: ACTIVE },
          startAt: { lt: endAt },
          endAt: { gt: req.startAt },
          ...(req.excludeAppointmentId ? { id: { not: req.excludeAppointmentId } } : {}),
        },
        select: { id: true },
      });
    const [doctorClash, patientClash] = await Promise.all([overlap('doctorId', doctor.id), overlap('patientId', patient.id)]);
    if (doctorClash) throw Errors.conflict('APPOINTMENT_CONFLICT', 'The doctor already has an appointment at this time');
    if (patientClash) throw Errors.conflict('PATIENT_DOUBLE_BOOKED', 'The patient already has an appointment at this time');

    return { service, doctor, patient, endAt };
  }

  async create(t: TenantContext, input: CreateAppointmentInput, opts: { bookedByPatient?: boolean } = {}) {
    const startAt = new Date(input.startAt);
    const status: AppointmentStatus = opts.bookedByPatient ? 'PENDING' : 'CONFIRMED';
    const appt = await this.prisma.$transaction(async (tx) => {
      const { endAt, doctor } = await this.validateBooking(
        t.clinicId,
        t.clinicTimezone,
        { ...input, startAt },
        tx,
      );
      const created = await tx.appointment.create({
        data: {
          clinicId: t.clinicId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          serviceId: input.serviceId,
          startAt,
          endAt,
          status,
          reason: input.reason,
          bookedById: t.userId,
          bookedByPatient: !!opts.bookedByPatient,
          statusHistory: { create: { toStatus: status, changedById: t.userId } },
        },
        select: APPOINTMENT_SELECT,
      });
      // Booking establishes the care relationship that gates the doctor's clinical access.
      await tx.careAssignment.upsert({
        where: { patientId_doctorId: { patientId: input.patientId, doctorId: input.doctorId } },
        create: { clinicId: t.clinicId, patientId: input.patientId, doctorId: input.doctorId },
        update: { endedAt: null },
      });
      await this.audit.log(
        {
          clinicId: t.clinicId,
          actorUserId: t.userId,
          action: 'appointment.created',
          entityType: 'Appointment',
          entityId: created.id,
          metadata: { status, bookedByPatient: !!opts.bookedByPatient },
        },
        tx,
      );
      return { created, doctorUserId: doctor.membership.userId };
    });

    await this.afterStatusChange(t, appt.created.id, status, 'created', appt.doctorUserId);
    return appt.created;
  }

  async list(t: TenantContext, q: AppointmentListQuery) {
    const where: Prisma.AppointmentWhereInput = {
      clinicId: t.clinicId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.doctorId ? { doctorId: q.doctorId } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.from || q.to ? { startAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } } : {}),
    };
    if (t.role === 'DOCTOR') {
      // Doctors see their own schedule.
      where.doctor = { membershipId: t.membershipId };
    }
    const [items, total] = await Promise.all([
      this.prisma.appointment.findMany({ where, select: APPOINTMENT_SELECT, orderBy: { startAt: 'asc' }, ...skipTake(q) }),
      this.prisma.appointment.count({ where }),
    ]);
    return paginate(items, total, q);
  }

  async get(t: TenantContext, id: string) {
    const appt = await this.prisma.appointment.findFirst({
      where: { id, clinicId: t.clinicId, ...(t.role === 'DOCTOR' ? { doctor: { membershipId: t.membershipId } } : {}) },
      select: {
        ...APPOINTMENT_SELECT,
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { fromStatus: true, toStatus: true, note: true, createdAt: true },
        },
      },
    });
    if (!appt) throw Errors.notFound('Appointment');
    return appt;
  }

  private async loadForUpdate(t: TenantContext, id: string, tx: Tx) {
    const appt = await tx.appointment.findFirst({
      where: { id, clinicId: t.clinicId, ...(t.role === 'DOCTOR' ? { doctor: { membershipId: t.membershipId } } : {}) },
      include: { doctor: { include: { membership: { select: { userId: true } } } } },
    });
    if (!appt) throw Errors.notFound('Appointment');
    return appt;
  }

  async transition(t: TenantContext, id: string, action: keyof typeof TRANSITIONS) {
    const rule = TRANSITIONS[action];
    const result = await this.prisma.$transaction(async (tx) => {
      const appt = await this.loadForUpdate(t, id, tx);
      if (!rule.from.includes(appt.status)) {
        throw Errors.conflict('INVALID_STATUS_TRANSITION', `Cannot ${action} an appointment that is ${appt.status}`);
      }
      if (rule.requireStarted && appt.startAt.getTime() > Date.now()) {
        throw Errors.unprocessable('NOT_STARTED', 'This appointment has not started yet');
      }
      // Optimistic concurrency: the status must still be what we read.
      const res = await tx.appointment.updateMany({ where: { id, status: appt.status }, data: { status: rule.to } });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'The appointment was changed by someone else');
      await tx.appointmentStatusHistory.create({ data: { appointmentId: id, fromStatus: appt.status, toStatus: rule.to, changedById: t.userId } });
      await this.audit.log(
        { clinicId: t.clinicId, actorUserId: t.userId, action: `appointment.${rule.to.toLowerCase()}`, entityType: 'Appointment', entityId: id, metadata: { from: appt.status } },
        tx,
      );
      return appt;
    });
    await this.afterStatusChange(t, id, rule.to, action, result.doctor.membership.userId);
    return this.get(t, id);
  }

  async cancel(t: TenantContext, id: string, input: CancelAppointmentInput, actor: { patientInitiated?: boolean } = {}) {
    const result = await this.prisma.$transaction(async (tx) => {
      const appt = await this.loadForUpdate(t, id, tx);
      if (!ACTIVE.includes(appt.status)) {
        throw Errors.conflict('INVALID_STATUS_TRANSITION', `Cannot cancel an appointment that is ${appt.status}`);
      }
      const res = await tx.appointment.updateMany({
        where: { id, status: appt.status },
        data: { status: 'CANCELLED', cancellationReason: input.reason ?? null },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'The appointment was changed by someone else');
      await tx.appointmentStatusHistory.create({
        data: { appointmentId: id, fromStatus: appt.status, toStatus: 'CANCELLED', changedById: t.userId, note: actor.patientInitiated ? 'Cancelled by patient' : null },
      });
      await this.audit.log(
        { clinicId: t.clinicId, actorUserId: t.userId, action: 'appointment.cancelled', entityType: 'Appointment', entityId: id, metadata: { from: appt.status, patientInitiated: !!actor.patientInitiated } },
        tx,
      );
      return appt;
    });
    await this.afterStatusChange(t, id, 'CANCELLED', 'cancel', result.doctor.membership.userId);
    return this.get(t, id);
  }

  async reschedule(t: TenantContext, id: string, input: RescheduleAppointmentInput) {
    const startAt = new Date(input.startAt);
    const result = await this.prisma.$transaction(async (tx) => {
      const appt = await this.loadForUpdate(t, id, tx);
      if (!ACTIVE.includes(appt.status)) {
        throw Errors.conflict('INVALID_STATUS_TRANSITION', `Cannot reschedule an appointment that is ${appt.status}`);
      }
      const doctorId = input.doctorId ?? appt.doctorId;
      const duration = input.durationMinutes ?? Math.round((appt.endAt.getTime() - appt.startAt.getTime()) / 60_000);
      const { endAt } = await this.validateBooking(
        t.clinicId,
        t.clinicTimezone,
        { patientId: appt.patientId, doctorId, serviceId: appt.serviceId, startAt, durationMinutes: duration, excludeAppointmentId: id },
        tx,
      );
      await tx.appointment.update({ where: { id }, data: { startAt, endAt, doctorId } });
      await tx.appointmentStatusHistory.create({
        data: { appointmentId: id, fromStatus: appt.status, toStatus: appt.status, changedById: t.userId, note: 'Rescheduled' },
      });
      if (doctorId !== appt.doctorId) {
        await tx.careAssignment.upsert({
          where: { patientId_doctorId: { patientId: appt.patientId, doctorId } },
          create: { clinicId: t.clinicId, patientId: appt.patientId, doctorId },
          update: { endedAt: null },
        });
      }
      await this.audit.log(
        { clinicId: t.clinicId, actorUserId: t.userId, action: 'appointment.rescheduled', entityType: 'Appointment', entityId: id, metadata: { doctorChanged: doctorId !== appt.doctorId } },
        tx,
      );
      return appt;
    });
    await this.afterStatusChange(t, id, result.status, 'reschedule', result.doctor.membership.userId);
    return this.get(t, id);
  }

  /** Available start times for a doctor on a clinic-local date. */
  async slots(t: TenantContext, doctorId: string, date: string, serviceId: string): Promise<AppointmentSlot[]> {
    return this.computeSlots(t.clinicId, t.clinicTimezone, doctorId, date, serviceId);
  }

  async computeSlots(clinicId: string, tz: string, doctorId: string, date: string, serviceId: string): Promise<AppointmentSlot[]> {
    const [service, doctor] = await Promise.all([
      this.prisma.clinicService.findFirst({ where: { id: serviceId, clinicId, active: true, deletedAt: null } }),
      this.prisma.doctorProfile.findFirst({ where: { id: doctorId, clinicId }, include: { availability: true } }),
    ]);
    if (!service) throw Errors.notFound('Service');
    if (!doctor) throw Errors.notFound('Doctor');

    const { start, end } = zonedDayBounds(date, tz);
    const dayOfWeek = zonedParts(new Date(start.getTime() + 12 * 3_600_000), tz).dayOfWeek;
    const busy = await this.prisma.appointment.findMany({
      where: { doctorId, status: { in: ACTIVE }, startAt: { lt: end }, endAt: { gt: start } },
      select: { startAt: true, endAt: true },
    });
    const now = Date.now();
    const slots: AppointmentSlot[] = [];
    for (const w of doctor.availability.filter((a) => a.dayOfWeek === dayOfWeek)) {
      for (let m = w.startMinute; m + service.durationMinutes <= w.endMinute; m += service.durationMinutes) {
        const s = zonedToUtc(date, m, tz);
        const e = new Date(s.getTime() + service.durationMinutes * 60_000);
        if (s.getTime() <= now) continue;
        if (busy.some((b) => b.startAt < e && b.endAt > s)) continue;
        slots.push({ startAt: s.toISOString(), endAt: e.toISOString() });
      }
    }
    return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  // ───────── Side effects: notifications & reminders ─────────

  private async afterStatusChange(t: TenantContext, id: string, status: AppointmentStatus, action: string, doctorUserId: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id },
      include: { clinic: { select: { name: true, timezone: true, reminderHoursBefore: true } } },
    });
    if (!appt) return;
    const when = formatLocal(appt.startAt, appt.clinic.timezone);
    const clinicName = appt.clinic.name;

    try {
      if (status === 'CONFIRMED' && (action === 'created' || action === 'confirm')) {
        await this.notifications.notifyPatient(appt.patientId, {
          clinicId: t.clinicId,
          type: 'APPOINTMENT_CONFIRMED',
          title: 'Appointment confirmed',
          body: `Your appointment at ${clinicName} is confirmed for ${when}.`,
          link: '/portal/appointments',
        });
      } else if (action === 'reschedule') {
        await this.notifications.notifyPatient(appt.patientId, {
          clinicId: t.clinicId,
          type: 'APPOINTMENT_CHANGED',
          title: 'Appointment rescheduled',
          body: `Your appointment at ${clinicName} has moved to ${when}.`,
          link: '/portal/appointments',
        });
      } else if (status === 'CANCELLED') {
        await this.notifications.notifyPatient(appt.patientId, {
          clinicId: t.clinicId,
          type: 'APPOINTMENT_CANCELLED',
          title: 'Appointment cancelled',
          body: `Your appointment at ${clinicName} on ${when} has been cancelled.`,
          link: '/portal/appointments',
        });
      }
      if (status === 'PENDING' && action === 'created') {
        const staff = await this.prisma.clinicMembership.findMany({
          where: { clinicId: t.clinicId, status: 'ACTIVE', deletedAt: null, role: { in: ['RECEPTIONIST', 'CLINIC_ADMIN'] } },
          select: { userId: true },
        });
        await this.notifications.notifyUsers([...staff.map((s) => s.userId), doctorUserId], {
          clinicId: t.clinicId,
          type: 'APPOINTMENT_REQUESTED',
          title: 'New appointment request',
          body: `A patient requested an appointment for ${when}.`,
          link: `/app/appointments?focus=${id}`,
        });
      }
      if (action === 'reschedule' || status === 'CANCELLED') {
        await this.notifications.notifyUsers([doctorUserId].filter((u) => u !== t.userId), {
          clinicId: t.clinicId,
          type: 'APPOINTMENT_CHANGED',
          title: status === 'CANCELLED' ? 'Appointment cancelled' : 'Appointment rescheduled',
          body: `An appointment on your schedule changed (${when}).`,
          link: `/app/appointments?focus=${id}`,
        });
      }
    } catch (e) {
      this.logger.error(`Notification side effect failed for appointment ${id}: ${(e as Error).message}`);
    }

    if (appt.status === 'CONFIRMED') await this.scheduleReminder(appt.id, appt.startAt, appt.clinic.reminderHoursBefore);
  }

  /** Schedules a delayed reminder. The worker re-validates the appointment before sending. */
  async scheduleReminder(appointmentId: string, startAt: Date, hoursBefore: number): Promise<void> {
    const delay = startAt.getTime() - hoursBefore * 3_600_000 - Date.now();
    if (delay <= 0) return;
    try {
      await this.reminders.add(
        'appointment-reminder',
        { appointmentId, startAt: startAt.toISOString() },
        { jobId: appointmentReminderJobId(appointmentId, startAt), delay, attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: true, removeOnFail: 1000 },
      );
    } catch (e) {
      this.logger.error(`Failed to schedule reminder for ${appointmentId}: ${(e as Error).message}`);
    }
  }

  /** Worker entrypoint: send the reminder only if the appointment is still confirmed at the same time. */
  async sendReminder(job: AppointmentReminderJob): Promise<'sent' | 'stale'> {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: job.appointmentId },
      include: { clinic: { select: { name: true, timezone: true } } },
    });
    if (!appt || appt.status !== 'CONFIRMED' || appt.startAt.toISOString() !== job.startAt) return 'stale';
    await this.notifications.notifyPatient(appt.patientId, {
      clinicId: appt.clinicId,
      type: 'APPOINTMENT_REMINDER',
      title: 'Appointment reminder',
      body: `Reminder: you have an appointment at ${appt.clinic.name} on ${formatLocal(appt.startAt, appt.clinic.timezone)}.`,
      link: '/portal/appointments',
    });
    return 'sent';
  }

  todayBounds(tz: string) {
    return zonedDayBounds(zonedDateString(new Date(), tz), tz);
  }

}
