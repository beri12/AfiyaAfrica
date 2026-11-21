import { z } from 'zod';
import { STAFF_ROLES, PLAN_CODES } from '../enums';
import { emailSchema, optionalText, passwordSchema, phoneSchema, text } from './common';

const timezoneSchema = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown timezone');

export const registerClinicSchema = z
  .object({
    clinic: z
      .object({
        name: text(160, 2),
        city: text(80),
        subCity: optionalText(80),
        addressLine: optionalText(200),
        phone: phoneSchema,
        email: emailSchema,
        licenseNumber: optionalText(80),
        timezone: timezoneSchema.default('Africa/Addis_Ababa'),
        planCode: z.enum(PLAN_CODES).default('STARTER'),
      })
      .strict(),
    admin: z
      .object({
        firstName: text(80),
        lastName: text(80),
        email: emailSchema,
        phone: phoneSchema.optional(),
        password: passwordSchema,
      })
      .strict(),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: 'You must accept the terms' }) }),
  })
  .strict();
export type RegisterClinicInput = z.infer<typeof registerClinicSchema>;

export const updateClinicSchema = z
  .object({
    name: text(160, 2).optional(),
    city: text(80).optional(),
    subCity: optionalText(80),
    addressLine: optionalText(200),
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    timezone: timezoneSchema.optional(),
    defaultAppointmentMinutes: z.number().int().min(5).max(240).optional(),
    aiExternalProcessingApproved: z.boolean().optional(),
    reminderHoursBefore: z.number().int().min(1).max(72).optional(),
  })
  .strict();
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;

export const reviewClinicSchema = z
  .object({ decision: z.enum(['APPROVE', 'REJECT', 'SUSPEND', 'REACTIVATE']), reason: optionalText(500) })
  .strict();
export type ReviewClinicInput = z.infer<typeof reviewClinicSchema>;

export const inviteStaffSchema = z
  .object({
    email: emailSchema,
    firstName: text(80),
    lastName: text(80),
    phone: phoneSchema.optional(),
    role: z.enum(STAFF_ROLES),
    specialty: optionalText(120),
    licenseNumber: optionalText(80),
  })
  .strict();
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const updateStaffSchema = z
  .object({
    role: z.enum(STAFF_ROLES).optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    specialty: optionalText(120),
  })
  .strict();
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const clinicServiceSchema = z
  .object({
    name: text(120),
    description: optionalText(500),
    durationMinutes: z.number().int().min(5).max(480),
    priceEtb: z.number().nonnegative().max(1_000_000).optional(),
    active: z.boolean().default(true),
  })
  .strict();
export type ClinicServiceInput = z.infer<typeof clinicServiceSchema>;
export const updateClinicServiceSchema = clinicServiceSchema.partial().strict();
export type UpdateClinicServiceInput = z.infer<typeof updateClinicServiceSchema>;

const minuteOfDay = z.number().int().min(0).max(24 * 60);
export const availabilityWindowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    startMinute: minuteOfDay,
    endMinute: minuteOfDay,
  })
  .strict()
  .refine((w) => w.endMinute > w.startMinute, { message: 'End must be after start', path: ['endMinute'] });

export const setAvailabilitySchema = z
  .object({ windows: z.array(availabilityWindowSchema).max(50) })
  .strict()
  .refine(
    ({ windows }) =>
      windows.every((a, i) =>
        windows.every(
          (b, j) => i === j || a.dayOfWeek !== b.dayOfWeek || a.endMinute <= b.startMinute || b.endMinute <= a.startMinute,
        ),
      ),
    { message: 'Availability windows overlap' },
  );
export type SetAvailabilityInput = z.infer<typeof setAvailabilitySchema>;

export const contactMessageSchema = z
  .object({
    name: text(120),
    email: emailSchema,
    organization: optionalText(160),
    message: text(2000, 10),
  })
  .strict();
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
