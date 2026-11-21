import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreatePatientInput,
  PatientSearchQuery,
  RecordConsentInput,
  UpdatePatientInput,
} from '@afyalink/shared';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { paginate, skipTake } from '../../common/http/pagination';
import type { TenantContext } from '../../common/decorators/access';
import { AppConfig } from '../../config/config.module';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';

/** Fields safe to show in lists and search results — no clinical information. */
export const PATIENT_LIST_SELECT = {
  id: true,
  medicalRecordNumber: true,
  firstName: true,
  middleName: true,
  lastName: true,
  dateOfBirth: true,
  sex: true,
  phone: true,
  status: true,
  createdAt: true,
} satisfies Prisma.PatientSelect;

const PATIENT_DETAIL_SELECT = {
  ...PATIENT_LIST_SELECT,
  email: true,
  city: true,
  subCity: true,
  preferredLanguage: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  userId: true,
  updatedAt: true,
  careAssignments: {
    where: { endedAt: null },
    select: {
      id: true,
      doctor: { select: { id: true, specialty: true, membership: { select: { user: { select: { firstName: true, lastName: true } } } } } },
    },
  },
} satisfies Prisma.PatientSelect;

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Base visibility filter. Doctors only see patients assigned to their care; other staff with `patient:read`
   * see all clinic patients (demographics only — clinical data has separate permissions).
   */
  async visibilityWhere(t: TenantContext): Promise<Prisma.PatientWhereInput> {
    const base: Prisma.PatientWhereInput = { clinicId: t.clinicId, deletedAt: null };
    if (t.role !== 'DOCTOR') return base;
    const doctor = await this.prisma.doctorProfile.findUnique({ where: { membershipId: t.membershipId }, select: { id: true } });
    return { ...base, careAssignments: { some: { doctorId: doctor?.id ?? '00000000-0000-0000-0000-000000000000', endedAt: null } } };
  }

  async findVisibleOrThrow(t: TenantContext, patientId: string, tx?: Tx) {
    const where = { ...(await this.visibilityWhere(t)), id: patientId };
    const patient = await (tx ?? this.prisma).patient.findFirst({ where, select: { id: true, userId: true, email: true, firstName: true, lastName: true, phone: true } });
    if (!patient) throw Errors.notFound('Patient');
    return patient;
  }

  async create(t: TenantContext, input: CreatePatientInput) {
    const { dataProcessingConsent: _consent, smsRemindersConsent, dateOfBirth, ...data } = input;
    const patient = await this.prisma.$transaction(async (tx) => {
      await this.billing.assertPatientCapacity(t.clinicId, tx);
      const clinic = await tx.clinic.update({
        where: { id: t.clinicId },
        data: { mrnSequence: { increment: 1 } },
        select: { mrnSequence: true },
      });
      const created = await tx.patient.create({
        data: {
          ...data,
          clinicId: t.clinicId,
          dateOfBirth: new Date(`${dateOfBirth}T00:00:00Z`),
          medicalRecordNumber: `MRN-${String(clinic.mrnSequence).padStart(6, '0')}`,
        },
        select: PATIENT_DETAIL_SELECT,
      });
      await tx.patientConsent.createMany({
        data: [
          { clinicId: t.clinicId, patientId: created.id, type: 'DATA_PROCESSING', granted: true, method: 'IN_PERSON_WRITTEN', recordedById: t.userId },
          { clinicId: t.clinicId, patientId: created.id, type: 'SMS_REMINDERS', granted: smsRemindersConsent, method: 'IN_PERSON_WRITTEN', recordedById: t.userId },
        ],
      });
      await this.audit.log(
        { clinicId: t.clinicId, actorUserId: t.userId, action: 'patient.created', entityType: 'Patient', entityId: created.id },
        tx,
      );
      return created;
    });
    return patient;
  }

  async search(t: TenantContext, q: PatientSearchQuery) {
    const terms = q.q?.split(/\s+/).filter(Boolean).slice(0, 4) ?? [];
    const where: Prisma.PatientWhereInput = {
      ...(await this.visibilityWhere(t)),
      ...(q.status ? { status: q.status } : {}),
      ...(terms.length
        ? {
            AND: terms.map((term) => ({
              OR: [
                { firstName: { contains: term, mode: 'insensitive' as const } },
                { middleName: { contains: term, mode: 'insensitive' as const } },
                { lastName: { contains: term, mode: 'insensitive' as const } },
                { medicalRecordNumber: { contains: term, mode: 'insensitive' as const } },
                { phone: { contains: term.replace(/^0/, '') } },
              ],
            })),
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.patient.findMany({ where, select: PATIENT_LIST_SELECT, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], ...skipTake(q) }),
      this.prisma.patient.count({ where }),
    ]);
    return paginate(items, total, q);
  }

  async get(t: TenantContext, id: string) {
    const where = { ...(await this.visibilityWhere(t)), id };
    const patient = await this.prisma.patient.findFirst({ where, select: PATIENT_DETAIL_SELECT });
    if (!patient) throw Errors.notFound('Patient');
    const consents = await this.effectiveConsents(id);
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'patient.viewed', entityType: 'Patient', entityId: id });
    return { ...patient, hasPortalAccount: !!patient.userId, consents };
  }

  async update(t: TenantContext, id: string, input: UpdatePatientInput) {
    await this.findVisibleOrThrow(t, id);
    const { dateOfBirth, ...rest } = input;
    const updated = await this.prisma.patient.update({
      where: { id },
      data: { ...rest, ...(dateOfBirth ? { dateOfBirth: new Date(`${dateOfBirth}T00:00:00Z`) } : {}) },
      select: PATIENT_DETAIL_SELECT,
    });
    await this.audit.log({
      clinicId: t.clinicId,
      actorUserId: t.userId,
      action: 'patient.updated',
      entityType: 'Patient',
      entityId: id,
      metadata: { fields: Object.keys(input) },
    });
    return updated;
  }

  // ───────── Consent ─────────

  async effectiveConsents(patientId: string) {
    const rows = await this.prisma.patientConsent.findMany({
      where: { patientId },
      orderBy: { createdAt: 'asc' },
      select: { type: true, granted: true, createdAt: true, method: true },
    });
    const map = new Map<string, (typeof rows)[number]>();
    for (const r of rows) map.set(r.type, r);
    return [...map.values()];
  }

  async consentHistory(t: TenantContext, patientId: string) {
    await this.findVisibleOrThrow(t, patientId);
    return this.prisma.patientConsent.findMany({
      where: { patientId, clinicId: t.clinicId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        type: true,
        granted: true,
        method: true,
        notes: true,
        createdAt: true,
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async recordConsent(t: TenantContext, patientId: string, input: RecordConsentInput, actorUserId = t.userId) {
    await this.findVisibleOrThrow(t, patientId);
    if (input.type === 'DATA_PROCESSING' && !input.granted) {
      // Withdrawal of processing consent must be handled by the clinic's data protection process (retention rules apply).
      await this.prisma.patient.update({ where: { id: patientId }, data: { status: 'INACTIVE' } });
    }
    const consent = await this.prisma.patientConsent.create({
      data: { ...input, clinicId: t.clinicId, patientId, recordedById: actorUserId },
    });
    await this.audit.log({
      clinicId: t.clinicId,
      actorUserId,
      action: input.granted ? 'consent.granted' : 'consent.withdrawn',
      entityType: 'Patient',
      entityId: patientId,
      metadata: { type: input.type, method: input.method },
    });
    return consent;
  }

  // ───────── Portal invitation ─────────

  async invite(t: TenantContext, patientId: string) {
    const patient = await this.findVisibleOrThrow(t, patientId);
    if (!patient.email) throw Errors.unprocessable('EMAIL_REQUIRED', 'Add an email address before inviting the patient to the portal');
    return this.prisma.$transaction(async (tx) => {
      let userId = patient.userId;
      if (!userId) {
        const existingUser = await tx.user.findUnique({ where: { email: patient.email! } });
        const user =
          existingUser ??
          (await tx.user.create({ data: { email: patient.email!, firstName: patient.firstName, lastName: patient.lastName, phone: patient.phone } }));
        userId = user.id;
        await tx.patient.update({ where: { id: patientId }, data: { userId } });
      }
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.clinicMembership.upsert({
        where: { clinicId_userId: { clinicId: t.clinicId, userId } },
        create: { clinicId: t.clinicId, userId, role: 'PATIENT', status: user.passwordHash ? 'ACTIVE' : 'INVITED' },
        update: {},
      });
      await tx.patientConsent.create({
        data: { clinicId: t.clinicId, patientId, type: 'PORTAL_RECORD_ACCESS', granted: true, method: 'IN_PERSON_WRITTEN', recordedById: t.userId },
      });
      const token = user.passwordHash ? undefined : await this.auth.createActivationToken(userId, tx);
      await this.audit.log(
        { clinicId: t.clinicId, actorUserId: t.userId, action: 'patient.portal_invited', entityType: 'Patient', entityId: patientId },
        tx,
      );
      return {
        activationUrl: token ? `${this.config.get('APP_ORIGIN')}/activate?token=${encodeURIComponent(token)}` : undefined,
        alreadyActive: !!user.passwordHash,
      };
    });
  }

  // ───────── Care team ─────────

  async assignCare(t: TenantContext, patientId: string, doctorId: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const doctor = await db.doctorProfile.findFirst({ where: { id: doctorId, clinicId: t.clinicId } });
    if (!doctor) throw Errors.notFound('Doctor');
    const patient = await db.patient.findFirst({ where: { id: patientId, clinicId: t.clinicId, deletedAt: null } });
    if (!patient) throw Errors.notFound('Patient');
    const assignment = await db.careAssignment.upsert({
      where: { patientId_doctorId: { patientId, doctorId } },
      create: { clinicId: t.clinicId, patientId, doctorId },
      update: { endedAt: null },
    });
    await this.audit.log(
      { clinicId: t.clinicId, actorUserId: t.userId, action: 'care.assigned', entityType: 'Patient', entityId: patientId, metadata: { doctorId } },
      tx,
    );
    return assignment;
  }

  async endCare(t: TenantContext, patientId: string, doctorId: string): Promise<void> {
    const res = await this.prisma.careAssignment.updateMany({
      where: { clinicId: t.clinicId, patientId, doctorId, endedAt: null },
      data: { endedAt: new Date() },
    });
    if (res.count === 0) throw Errors.notFound('Care assignment');
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'care.ended', entityType: 'Patient', entityId: patientId, metadata: { doctorId } });
  }

  async accessLog(t: TenantContext, patientId: string) {
    const exists = await this.prisma.patient.count({ where: { id: patientId, clinicId: t.clinicId } });
    if (!exists) throw Errors.notFound('Patient');
    const relatedNoteIds = (
      await this.prisma.clinicalNote.findMany({ where: { patientId, clinicId: t.clinicId }, select: { id: true } })
    ).map((n) => n.id);
    return this.prisma.auditLog.findMany({
      where: {
        clinicId: t.clinicId,
        OR: [{ entityType: 'Patient', entityId: patientId }, { entityType: 'ClinicalNote', entityId: { in: relatedNoteIds } }, { entityType: 'PatientRecord', entityId: patientId }],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, action: true, entityType: true, createdAt: true, ipAddress: true, actor: { select: { firstName: true, lastName: true } } },
    });
  }
}
