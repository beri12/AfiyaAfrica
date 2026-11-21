import { Controller, Get, HttpCode, Injectable, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import type { ConsentType } from '@prisma/client';
import {
  cancelAppointmentSchema,
  isoDateSchema,
  recordConsentSchema,
  requestAppointmentSchema,
  type CancelAppointmentInput,
  type RecordConsentInput,
  type RequestAppointmentInput,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { Authenticated, CurrentUser, type AuthUser, type TenantContext } from '../../common/decorators/access';
import { ZodBody } from '../../common/pipes/zod';
import { AuditService } from '../audit/audit.service';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentsService } from '../appointments/appointments.service';
import { ClinicalModule } from '../clinical/clinical.module';
import { ClinicalNotesService } from '../clinical/clinical-notes.service';

/** Consents a patient may change themselves. Data-processing withdrawal goes through the clinic. */
const SELF_SERVICE_CONSENTS: ConsentType[] = ['SMS_REMINDERS', 'EMAIL_REMINDERS', 'AI_ASSISTED_DOCUMENTATION', 'PORTAL_RECORD_ACCESS'];

/**
 * Patient self-service. Every query is scoped to Patient rows linked to the signed-in user, and the clinic
 * membership (role PATIENT) must be active — staff permissions are never used here.
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly notes: ClinicalNotesService,
    private readonly audit: AuditService,
  ) {}

  private async profiles(userId: string) {
    return this.prisma.patient.findMany({
      where: {
        userId,
        deletedAt: null,
        clinic: { status: 'ACTIVE', deletedAt: null, memberships: { some: { userId, role: 'PATIENT', status: 'ACTIVE', deletedAt: null } } },
      },
      select: {
        id: true,
        clinicId: true,
        firstName: true,
        lastName: true,
        medicalRecordNumber: true,
        dateOfBirth: true,
        phone: true,
        email: true,
        preferredLanguage: true,
        clinic: { select: { id: true, name: true, city: true, phone: true, timezone: true } },
      },
    });
  }

  private async profileForClinic(userId: string, clinicId: string) {
    const p = (await this.profiles(userId)).find((x) => x.clinicId === clinicId);
    if (!p) throw Errors.notFound('Clinic');
    return p;
  }

  /** Synthetic tenant context for reusing staff-side booking logic under patient identity. */
  private async ctxFor(userId: string, clinicId: string): Promise<TenantContext> {
    const m = await this.prisma.clinicMembership.findFirstOrThrow({
      where: { userId, clinicId, role: 'PATIENT', status: 'ACTIVE', deletedAt: null },
      include: { clinic: { select: { timezone: true } } },
    });
    return { clinicId, clinicTimezone: m.clinic.timezone, role: 'PATIENT', membershipId: m.id, userId };
  }

  async me(userId: string) {
    const profiles = await this.profiles(userId);
    const consents = await this.prisma.patientConsent.findMany({
      where: { patientId: { in: profiles.map((p) => p.id) } },
      orderBy: { createdAt: 'asc' },
      select: { patientId: true, type: true, granted: true, createdAt: true },
    });
    return profiles.map((p) => {
      const latest = new Map<string, { type: string; granted: boolean; createdAt: Date }>();
      for (const c of consents.filter((x) => x.patientId === p.id)) latest.set(c.type, c);
      return { ...p, consents: [...latest.values()] };
    });
  }

  async bookingOptions(userId: string, clinicId: string) {
    await this.profileForClinic(userId, clinicId);
    const [services, doctors] = await Promise.all([
      this.prisma.clinicService.findMany({ where: { clinicId, active: true, deletedAt: null }, select: { id: true, name: true, durationMinutes: true, description: true } }),
      this.prisma.doctorProfile.findMany({
        where: { clinicId, membership: { status: 'ACTIVE', role: 'DOCTOR', deletedAt: null } },
        select: { id: true, specialty: true, membership: { select: { user: { select: { firstName: true, lastName: true } } } } },
      }),
    ]);
    return { services, doctors };
  }

  async slots(userId: string, clinicId: string, doctorId: string, date: string, serviceId: string) {
    const p = await this.profileForClinic(userId, clinicId);
    return this.appointments.computeSlots(clinicId, p.clinic.timezone, doctorId, date, serviceId);
  }

  async listAppointments(userId: string) {
    const profiles = await this.profiles(userId);
    return this.prisma.appointment.findMany({
      where: { patientId: { in: profiles.map((p) => p.id) } },
      orderBy: { startAt: 'desc' },
      take: 100,
      select: {
        id: true,
        startAt: true,
        endAt: true,
        status: true,
        clinic: { select: { id: true, name: true, timezone: true } },
        service: { select: { name: true } },
        doctor: { select: { membership: { select: { user: { select: { firstName: true, lastName: true } } } } } },
      },
    });
  }

  async request(userId: string, input: RequestAppointmentInput) {
    const profile = await this.profileForClinic(userId, input.clinicId);
    const ctx = await this.ctxFor(userId, input.clinicId);
    const pendingCount = await this.prisma.appointment.count({ where: { patientId: profile.id, status: 'PENDING' } });
    if (pendingCount >= 3) throw Errors.conflict('TOO_MANY_PENDING', 'You already have several pending requests. Please wait for the clinic to respond.');
    return this.appointments.create(
      ctx,
      { patientId: profile.id, doctorId: input.doctorId, serviceId: input.serviceId, startAt: input.startAt, reason: input.reason },
      { bookedByPatient: true },
    );
  }

  async cancel(userId: string, appointmentId: string, input: CancelAppointmentInput) {
    const profiles = await this.profiles(userId);
    const appt = await this.prisma.appointment.findFirst({ where: { id: appointmentId, patientId: { in: profiles.map((p) => p.id) } } });
    if (!appt) throw Errors.notFound('Appointment');
    const ctx = await this.ctxFor(userId, appt.clinicId);
    const r = await this.appointments.cancel(ctx, appointmentId, input, { patientInitiated: true });
    return { id: r.id, status: r.status };
  }

  async records(userId: string) {
    const profiles = await this.profiles(userId);
    const allowed: string[] = [];
    for (const p of profiles) {
      const c = await this.prisma.patientConsent.findFirst({ where: { patientId: p.id, type: 'PORTAL_RECORD_ACCESS' }, orderBy: { createdAt: 'desc' } });
      if (c?.granted) allowed.push(p.id);
    }
    const notes = await this.notes.portalNotes(allowed);
    for (const p of profiles.filter((x) => allowed.includes(x.id))) {
      await this.audit.log({ clinicId: p.clinicId, actorUserId: userId, action: 'portal.records_viewed', entityType: 'Patient', entityId: p.id });
    }
    return { notes, recordAccessEnabled: allowed.length > 0 };
  }

  async setConsent(userId: string, patientId: string, input: RecordConsentInput) {
    if (!SELF_SERVICE_CONSENTS.includes(input.type)) {
      throw Errors.forbidden('Please contact your clinic to change data-processing consent');
    }
    const p = (await this.profiles(userId)).find((x) => x.id === patientId);
    if (!p) throw Errors.notFound('Patient');
    const consent = await this.prisma.patientConsent.create({
      data: { clinicId: p.clinicId, patientId, type: input.type, granted: input.granted, method: 'PORTAL', recordedById: userId },
    });
    await this.audit.log({
      clinicId: p.clinicId,
      actorUserId: userId,
      action: input.granted ? 'consent.granted' : 'consent.withdrawn',
      entityType: 'Patient',
      entityId: patientId,
      metadata: { type: input.type, method: 'PORTAL' },
    });
    return consent;
  }
}

@ApiTags('Patient portal')
@Controller('me')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('patient-profiles')
  @Authenticated()
  me(@CurrentUser() u: AuthUser) {
    return this.portal.me(u.id);
  }

  @Get('clinics/:clinicId/booking-options')
  @Authenticated()
  options(@CurrentUser() u: AuthUser, @Param('clinicId', ParseUUIDPipe) clinicId: string) {
    return this.portal.bookingOptions(u.id, clinicId);
  }

  @Get('clinics/:clinicId/doctors/:doctorId/slots')
  @Authenticated()
  @ApiQuery({ name: 'date' })
  @ApiQuery({ name: 'serviceId' })
  slots(
    @CurrentUser() u: AuthUser,
    @Param('clinicId', ParseUUIDPipe) clinicId: string,
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
    @Query('date') date: string,
    @Query('serviceId', ParseUUIDPipe) serviceId: string,
  ) {
    if (!isoDateSchema.safeParse(date).success) throw Errors.badRequest('VALIDATION_FAILED', 'date must be YYYY-MM-DD');
    return this.portal.slots(u.id, clinicId, doctorId, date, serviceId);
  }

  @Get('appointments')
  @Authenticated()
  appointments(@CurrentUser() u: AuthUser) {
    return this.portal.listAppointments(u.id);
  }

  @Post('appointments')
  @Authenticated()
  request(@CurrentUser() u: AuthUser, @ZodBody(requestAppointmentSchema) body: RequestAppointmentInput) {
    return this.portal.request(u.id, body);
  }

  @Post('appointments/:id/cancel')
  @Authenticated()
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZodBody(cancelAppointmentSchema) body: CancelAppointmentInput) {
    return this.portal.cancel(u.id, id, body);
  }

  @Get('records')
  @Authenticated()
  records(@CurrentUser() u: AuthUser) {
    return this.portal.records(u.id);
  }

  @Post('patient-profiles/:id/consents')
  @Authenticated()
  consent(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZodBody(recordConsentSchema) body: RecordConsentInput) {
    return this.portal.setConsent(u.id, id, body);
  }
}

@Module({ imports: [AppointmentsModule, ClinicalModule], controllers: [PortalController], providers: [PortalService] })
export class PortalModule {}
