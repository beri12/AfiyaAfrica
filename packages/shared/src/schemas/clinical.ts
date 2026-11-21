import { z } from 'zod';
import { FOLLOW_UP_STATUSES, LAB_ORDER_STATUSES, NOTE_STATUSES, PRIORITIES } from '../enums';
import { isoDateSchema, optionalText, paginationQuerySchema, text } from './common';

/** Structured SOAP-style note sections. All optional so drafts can be partial. */
export const noteSectionsSchema = z
  .object({
    chiefComplaint: optionalText(4000),
    history: optionalText(8000),
    examination: optionalText(8000),
    assessment: optionalText(8000),
    plan: optionalText(8000),
    additionalNotes: optionalText(8000),
  })
  .strict();
export type NoteSections = z.infer<typeof noteSectionsSchema>;

export const NOTE_SECTION_LABELS: Record<keyof NoteSections, string> = {
  chiefComplaint: 'Chief complaint',
  history: 'History of present illness',
  examination: 'Examination findings',
  assessment: 'Clinician assessment',
  plan: 'Plan',
  additionalNotes: 'Additional notes',
};

export const createNoteSchema = z
  .object({
    patientId: z.string().uuid(),
    appointmentId: z.string().uuid().optional(),
    title: text(160),
    sections: noteSectionsSchema,
    shareWithPatient: z.boolean().default(false),
  })
  .strict();
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteDraftSchema = z
  .object({
    title: text(160).optional(),
    sections: noteSectionsSchema,
    shareWithPatient: z.boolean().optional(),
  })
  .strict();
export type UpdateNoteDraftInput = z.infer<typeof updateNoteDraftSchema>;

export const signNoteSchema = z
  .object({
    /** Explicit attestation that the clinician reviewed the content (including any AI-assisted text). */
    attestation: z.literal(true, { errorMap: () => ({ message: 'You must confirm you reviewed this note' }) }),
  })
  .strict();
export type SignNoteInput = z.infer<typeof signNoteSchema>;

export const amendNoteSchema = z
  .object({
    sections: noteSectionsSchema,
    reason: text(500, 5),
    attestation: z.literal(true, { errorMap: () => ({ message: 'You must confirm you reviewed this amendment' }) }),
  })
  .strict();
export type AmendNoteInput = z.infer<typeof amendNoteSchema>;

export const noteListQuerySchema = paginationQuerySchema.extend({
  patientId: z.string().uuid().optional(),
  status: z.enum(NOTE_STATUSES).optional(),
  mine: z.coerce.boolean().optional(),
});
export type NoteListQuery = z.infer<typeof noteListQuerySchema>;

export const createFollowUpSchema = z
  .object({
    patientId: z.string().uuid(),
    title: text(160),
    details: optionalText(1000),
    dueDate: isoDateSchema,
    priority: z.enum(PRIORITIES).default('NORMAL'),
    assignedToUserId: z.string().uuid().optional(),
  })
  .strict();
export type CreateFollowUpInput = z.infer<typeof createFollowUpSchema>;

export const updateFollowUpSchema = z
  .object({
    title: text(160).optional(),
    details: optionalText(1000),
    dueDate: isoDateSchema.optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(FOLLOW_UP_STATUSES).optional(),
    assignedToUserId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type UpdateFollowUpInput = z.infer<typeof updateFollowUpSchema>;

export const followUpListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  patientId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
});
export type FollowUpListQuery = z.infer<typeof followUpListQuerySchema>;

export const createLaboratorySchema = z.object({ name: text(120), location: optionalText(200) }).strict();
export type CreateLaboratoryInput = z.infer<typeof createLaboratorySchema>;

export const createLabOrderSchema = z
  .object({
    patientId: z.string().uuid(),
    laboratoryId: z.string().uuid(),
    testName: text(160),
    priority: z.enum(PRIORITIES).default('NORMAL'),
    instructions: optionalText(1000),
  })
  .strict();
export type CreateLabOrderInput = z.infer<typeof createLabOrderSchema>;

export const updateLabOrderStatusSchema = z
  .object({ status: z.enum(LAB_ORDER_STATUSES).exclude(['RESULTED']) })
  .strict();
export type UpdateLabOrderStatusInput = z.infer<typeof updateLabOrderStatusSchema>;

export const recordLabResultSchema = z
  .object({
    resultText: text(4000),
    unit: optionalText(40),
    referenceRange: optionalText(120),
    abnormal: z.boolean().default(false),
  })
  .strict();
export type RecordLabResultInput = z.infer<typeof recordLabResultSchema>;

export const labOrderListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(LAB_ORDER_STATUSES).optional(),
  patientId: z.string().uuid().optional(),
});
export type LabOrderListQuery = z.infer<typeof labOrderListQuerySchema>;
