import { Injectable } from '@nestjs/common';
import type { NoteSource, Prisma } from '@prisma/client';
import {
  noteSectionsSchema,
  type AmendNoteInput,
  type CreateNoteInput,
  type NoteListQuery,
  type NoteSections,
  type UpdateNoteDraftInput,
  type UpdatePatientRecordInput,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { Errors } from '../../common/http/errors';
import { paginate, skipTake } from '../../common/http/pagination';
import type { TenantContext } from '../../common/decorators/access';
import { AuditService } from '../audit/audit.service';
import { ClinicalAccessService } from './clinical-access.service';

const NOTE_META_SELECT = {
  id: true,
  title: true,
  status: true,
  source: true,
  shareWithPatient: true,
  currentVersion: true,
  signedAt: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, medicalRecordNumber: true } },
  author: { select: { id: true, firstName: true, lastName: true } },
  appointmentId: true,
} satisfies Prisma.ClinicalNoteSelect;

@Injectable()
export class ClinicalNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly access: ClinicalAccessService,
    private readonly audit: AuditService,
  ) {}

  private encryptSections(sections: NoteSections): string {
    return this.crypto.encrypt(JSON.stringify(noteSectionsSchema.parse(sections)));
  }

  private decryptSections(enc: string): NoteSections {
    return noteSectionsSchema.parse(JSON.parse(this.crypto.decrypt(enc)));
  }

  async create(t: TenantContext, input: CreateNoteInput, opts: { source?: NoteSource; aiInteractionId?: string } = {}) {
    await this.access.assertCareAccess(t, input.patientId);
    if (input.appointmentId) {
      const appt = await this.prisma.appointment.count({ where: { id: input.appointmentId, clinicId: t.clinicId, patientId: input.patientId } });
      if (!appt) throw Errors.notFound('Appointment');
    }
    const source = opts.source ?? 'CLINICIAN';
    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalNote.create({
        data: {
          clinicId: t.clinicId,
          patientId: input.patientId,
          appointmentId: input.appointmentId,
          authorId: t.userId,
          title: input.title,
          source,
          shareWithPatient: input.shareWithPatient,
          versions: {
            create: {
              version: 1,
              status: 'DRAFT',
              source,
              contentEnc: this.encryptSections(input.sections),
              authorId: t.userId,
              aiInteractionId: opts.aiInteractionId,
            },
          },
        },
        select: NOTE_META_SELECT,
      });
      await this.audit.log(
        { clinicId: t.clinicId, actorUserId: t.userId, action: 'clinical_note.created', entityType: 'ClinicalNote', entityId: created.id, metadata: { source } },
        tx,
      );
      return created;
    });
    return note;
  }

  async list(t: TenantContext, q: NoteListQuery) {
    const patientIds = await this.access.careDoctorPatientIds(t);
    if (q.patientId && !patientIds.includes(q.patientId)) throw Errors.notFound('Patient');
    const where: Prisma.ClinicalNoteWhereInput = {
      clinicId: t.clinicId,
      patientId: q.patientId ? q.patientId : { in: patientIds },
      ...(q.status ? { status: q.status } : {}),
      ...(q.mine ? { authorId: t.userId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.clinicalNote.findMany({ where, select: NOTE_META_SELECT, orderBy: { updatedAt: 'desc' }, ...skipTake(q) }),
      this.prisma.clinicalNote.count({ where }),
    ]);
    return paginate(items, total, q);
  }

  private async loadNote(t: TenantContext, id: string) {
    const note = await this.prisma.clinicalNote.findFirst({ where: { id, clinicId: t.clinicId } });
    if (!note) throw Errors.notFound('Clinical note');
    await this.access.assertCareAccess(t, note.patientId);
    return note;
  }

  async get(t: TenantContext, id: string) {
    await this.loadNote(t, id);
    const note = await this.prisma.clinicalNote.findUniqueOrThrow({
      where: { id },
      select: {
        ...NOTE_META_SELECT,
        versions: {
          orderBy: { version: 'desc' },
          select: { id: true, version: true, status: true, source: true, amendmentReason: true, createdAt: true, contentEnc: true, aiInteractionId: true, author: { select: { firstName: true, lastName: true } } },
        },
        aiReviews: { select: { decision: true, createdAt: true, reviewer: { select: { firstName: true, lastName: true } } } },
      },
    });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'clinical_note.viewed', entityType: 'ClinicalNote', entityId: id });
    const versions = note.versions.map(({ contentEnc, ...v }) => ({ ...v, sections: this.decryptSections(contentEnc) }));
    return { ...note, versions, current: versions[0] };
  }

  async updateDraft(t: TenantContext, id: string, input: UpdateNoteDraftInput) {
    const note = await this.loadNote(t, id);
    if (note.authorId !== t.userId) throw Errors.forbidden('Only the author can edit a draft');
    if (note.status !== 'DRAFT' && note.status !== 'IN_REVIEW') {
      throw Errors.conflict('NOTE_LOCKED', 'Signed notes cannot be edited — create an amendment instead');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalNoteVersion.update({
        where: { noteId_version: { noteId: id, version: note.currentVersion } },
        data: { contentEnc: this.encryptSections(input.sections), status: 'DRAFT' },
      });
      await tx.clinicalNote.update({
        where: { id },
        data: { status: 'DRAFT', ...(input.title ? { title: input.title } : {}), ...(input.shareWithPatient !== undefined ? { shareWithPatient: input.shareWithPatient } : {}) },
      });
      await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'clinical_note.draft_updated', entityType: 'ClinicalNote', entityId: id }, tx);
    });
    return this.get(t, id);
  }

  async submitForReview(t: TenantContext, id: string) {
    const note = await this.loadNote(t, id);
    if (note.status !== 'DRAFT') throw Errors.conflict('INVALID_STATUS_TRANSITION', `Cannot submit a note that is ${note.status}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.clinicalNote.update({ where: { id }, data: { status: 'IN_REVIEW' } });
      await tx.clinicalNoteVersion.update({ where: { noteId_version: { noteId: id, version: note.currentVersion } }, data: { status: 'IN_REVIEW' } });
      await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'clinical_note.submitted', entityType: 'ClinicalNote', entityId: id }, tx);
    });
    return this.get(t, id);
  }

  /** Signs the current version. AI-assisted notes require a recorded clinician review of the AI draft first. */
  async sign(t: TenantContext, id: string) {
    const note = await this.loadNote(t, id);
    if (note.status !== 'DRAFT' && note.status !== 'IN_REVIEW') {
      throw Errors.conflict('INVALID_STATUS_TRANSITION', `Cannot sign a note that is ${note.status}`);
    }
    if (note.source === 'AI_ASSISTED') {
      const review = await this.prisma.aIReview.count({ where: { noteId: id, decision: { in: ['ACCEPTED', 'EDITED'] } } });
      if (!review) {
        throw Errors.unprocessable('AI_REVIEW_REQUIRED', 'Record your review of the AI-generated draft before signing');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.clinicalNote.updateMany({
        where: { id, status: note.status },
        data: { status: 'SIGNED', signedAt: new Date(), signedById: t.userId },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'The note was changed by someone else');
      await tx.clinicalNoteVersion.update({ where: { noteId_version: { noteId: id, version: note.currentVersion } }, data: { status: 'SIGNED' } });
      await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'clinical_note.signed', entityType: 'ClinicalNote', entityId: id, metadata: { version: note.currentVersion } }, tx);
    });
    return this.get(t, id);
  }

  async amend(t: TenantContext, id: string, input: AmendNoteInput) {
    const note = await this.loadNote(t, id);
    if (note.status !== 'SIGNED' && note.status !== 'AMENDED') {
      throw Errors.conflict('INVALID_STATUS_TRANSITION', 'Only signed notes can be amended; edit the draft instead');
    }
    const version = note.currentVersion + 1;
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.clinicalNote.updateMany({
        where: { id, currentVersion: note.currentVersion },
        data: { status: 'AMENDED', currentVersion: version, signedAt: new Date(), signedById: t.userId },
      });
      if (res.count !== 1) throw Errors.conflict('CONCURRENT_UPDATE', 'The note was changed by someone else');
      await tx.clinicalNoteVersion.create({
        data: {
          noteId: id,
          version,
          status: 'AMENDED',
          source: 'CLINICIAN',
          contentEnc: this.encryptSections(input.sections),
          amendmentReason: input.reason,
          authorId: t.userId,
        },
      });
      await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'clinical_note.amended', entityType: 'ClinicalNote', entityId: id, metadata: { version } }, tx);
    });
    return this.get(t, id);
  }

  // ───────── Clinical summary (PatientRecord) ─────────

  async getRecord(t: TenantContext, patientId: string) {
    await this.access.assertCareAccess(t, patientId);
    const r = await this.prisma.patientRecord.findUnique({ where: { patientId } });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'patient_record.viewed', entityType: 'PatientRecord', entityId: patientId });
    return {
      patientId,
      allergies: this.crypto.decryptOptional(r?.allergiesEnc ?? null),
      chronicConditions: this.crypto.decryptOptional(r?.chronicConditionsEnc ?? null),
      currentMedications: this.crypto.decryptOptional(r?.currentMedicationsEnc ?? null),
      bloodGroup: r?.bloodGroup ?? null,
      updatedAt: r?.updatedAt ?? null,
    };
  }

  async updateRecord(t: TenantContext, patientId: string, input: UpdatePatientRecordInput) {
    await this.access.assertCareAccess(t, patientId);
    const data = {
      ...(input.allergies !== undefined ? { allergiesEnc: this.crypto.encryptOptional(input.allergies) } : {}),
      ...(input.chronicConditions !== undefined ? { chronicConditionsEnc: this.crypto.encryptOptional(input.chronicConditions) } : {}),
      ...(input.currentMedications !== undefined ? { currentMedicationsEnc: this.crypto.encryptOptional(input.currentMedications) } : {}),
      ...(input.bloodGroup !== undefined ? { bloodGroup: input.bloodGroup } : {}),
    };
    await this.prisma.patientRecord.upsert({
      where: { patientId },
      create: { clinicId: t.clinicId, patientId, ...data },
      update: data,
    });
    await this.audit.log({
      clinicId: t.clinicId,
      actorUserId: t.userId,
      action: 'patient_record.updated',
      entityType: 'PatientRecord',
      entityId: patientId,
      metadata: { fields: Object.keys(input) },
    });
    return this.getRecord(t, patientId);
  }

  /** Signed notes the patient may see in the portal (requires PORTAL_RECORD_ACCESS consent). */
  async portalNotes(patientIds: string[]) {
    const notes = await this.prisma.clinicalNote.findMany({
      where: { patientId: { in: patientIds }, shareWithPatient: true, status: { in: ['SIGNED', 'AMENDED'] } },
      orderBy: { signedAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        signedAt: true,
        currentVersion: true,
        clinic: { select: { name: true } },
        author: { select: { firstName: true, lastName: true } },
        versions: { orderBy: { version: 'desc' }, take: 1, select: { contentEnc: true } },
      },
    });
    return notes.map(({ versions, ...n }) => ({ ...n, sections: versions[0] ? this.decryptSections(versions[0].contentEnc) : {} }));
  }
}
