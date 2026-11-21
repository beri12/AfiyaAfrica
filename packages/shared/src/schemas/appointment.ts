import { z } from 'zod';
import { APPOINTMENT_STATUSES } from '../enums';
import { isoDateSchema, isoDateTimeSchema, optionalText, paginationQuerySchema } from './common';

/** Booking may not be made more than this many days ahead. */
export const MAX_BOOKING_HORIZON_DAYS = 180;

export const createAppointmentSchema = z
  .object({
    patientId: z.string().uuid(),
    doctorId: z.string().uuid(),
    serviceId: z.string().uuid(),
    startAt: isoDateTimeSchema,
    /** Optional; defaults to service duration. */
    durationMinutes: z.number().int().min(5).max(480).optional(),
    /** Short administrative reason. Not shared in notifications. */
    reason: optionalText(300),
  })
  .strict();
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const requestAppointmentSchema = z
  .object({
    clinicId: z.string().uuid(),
    doctorId: z.string().uuid(),
    serviceId: z.string().uuid(),
    startAt: isoDateTimeSchema,
    reason: optionalText(300),
  })
  .strict();
export type RequestAppointmentInput = z.infer<typeof requestAppointmentSchema>;

export const rescheduleAppointmentSchema = z
  .object({
    startAt: isoDateTimeSchema,
    durationMinutes: z.number().int().min(5).max(480).optional(),
    doctorId: z.string().uuid().optional(),
  })
  .strict();
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentSchema>;

export const cancelAppointmentSchema = z.object({ reason: optionalText(300) }).strict();
export type CancelAppointmentInput = z.infer<typeof cancelAppointmentSchema>;

export const appointmentListQuerySchema = paginationQuerySchema.extend({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  doctorId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
});
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const slotsQuerySchema = z.object({
  date: isoDateSchema,
  serviceId: z.string().uuid(),
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export interface AppointmentSlot {
  startAt: string;
  endAt: string;
}
