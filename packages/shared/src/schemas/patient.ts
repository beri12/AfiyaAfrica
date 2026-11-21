import { z } from 'zod';
import { CONSENT_TYPES, LANGUAGES, PATIENT_STATUSES, SEXES } from '../enums';
import { emailSchema, isoDateSchema, optionalText, paginationQuerySchema, phoneSchema, text } from './common';

const dateOfBirth = isoDateSchema.refine((d) => {
  const date = new Date(`${d}T00:00:00Z`);
  const now = new Date();
  return !Number.isNaN(date.getTime()) && date <= now && date.getUTCFullYear() >= 1900;
}, 'Date of birth must be a past date');

export const createPatientSchema = z
  .object({
    firstName: text(80),
    middleName: optionalText(80),
    lastName: text(80),
    dateOfBirth,
    sex: z.enum(SEXES),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    city: optionalText(80),
    subCity: optionalText(80),
    preferredLanguage: z.enum(LANGUAGES).default('en'),
    emergencyContactName: optionalText(120),
    emergencyContactPhone: phoneSchema.optional(),
    /** Consent to clinic processing must be captured at registration. */
    dataProcessingConsent: z.literal(true, {
      errorMap: () => ({ message: 'Data processing consent is required to register a patient' }),
    }),
    smsRemindersConsent: z.boolean().default(false),
  })
  .strict()
  .refine((p) => !p.emergencyContactPhone || !!p.emergencyContactName, {
    message: 'Emergency contact name is required with a phone number',
    path: ['emergencyContactName'],
  });
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = z
  .object({
    firstName: text(80).optional(),
    middleName: optionalText(80),
    lastName: text(80).optional(),
    dateOfBirth: dateOfBirth.optional(),
    sex: z.enum(SEXES).optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    city: optionalText(80),
    subCity: optionalText(80),
    preferredLanguage: z.enum(LANGUAGES).optional(),
    emergencyContactName: optionalText(120),
    emergencyContactPhone: phoneSchema.optional(),
    status: z.enum(PATIENT_STATUSES).optional(),
  })
  .strict();
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const patientSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PATIENT_STATUSES).optional(),
});
export type PatientSearchQuery = z.infer<typeof patientSearchQuerySchema>;

export const recordConsentSchema = z
  .object({
    type: z.enum(CONSENT_TYPES),
    granted: z.boolean(),
    method: z.enum(['IN_PERSON_VERBAL', 'IN_PERSON_WRITTEN', 'PORTAL']).default('IN_PERSON_WRITTEN'),
    notes: optionalText(500),
  })
  .strict();
export type RecordConsentInput = z.infer<typeof recordConsentSchema>;

export const updatePatientRecordSchema = z
  .object({
    allergies: optionalText(2000),
    chronicConditions: optionalText(2000),
    currentMedications: optionalText(2000),
    bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'UNKNOWN']).optional(),
  })
  .strict();
export type UpdatePatientRecordInput = z.infer<typeof updatePatientRecordSchema>;

export const assignCareSchema = z.object({ doctorId: z.string().uuid() }).strict();
export type AssignCareInput = z.infer<typeof assignCareSchema>;
