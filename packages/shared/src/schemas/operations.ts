import { z } from 'zod';
import {
  AI_REVIEW_DECISIONS,
  CONTENT_STATUSES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  PLAN_CODES,
  PRIORITIES,
  SUPPORTED_LANGUAGES,
  SUPPORT_TICKET_STATUSES,
  type Language,
} from '../enums';
import { isoDateSchema, optionalText, paginationQuerySchema, text } from './common';

const supportedLanguage = z
  .string()
  .refine((l): l is Language => (SUPPORTED_LANGUAGES as readonly string[]).includes(l), 'Language not yet supported')
  .default('en');

// ---------- AI ----------
export const aiAssistantSchema = z
  .object({ message: text(2000), language: supportedLanguage })
  .strict();
export type AiAssistantInput = z.infer<typeof aiAssistantSchema>;

export const aiClinicalDraftSchema = z
  .object({
    patientId: z.string().uuid(),
    /** Doctor-provided free-text notes to structure. */
    rawNotes: text(12000, 10),
    language: supportedLanguage,
  })
  .strict();
export type AiClinicalDraftInput = z.infer<typeof aiClinicalDraftSchema>;

export const aiHealthInfoSchema = z
  .object({ question: text(1000, 3), language: supportedLanguage })
  .strict();
export type AiHealthInfoInput = z.infer<typeof aiHealthInfoSchema>;

export const aiReviewSchema = z
  .object({
    interactionId: z.string().uuid(),
    decision: z.enum(AI_REVIEW_DECISIONS),
    comment: optionalText(1000),
  })
  .strict();
export type AiReviewInput = z.infer<typeof aiReviewSchema>;

export const healthContentSchema = z
  .object({
    title: text(200),
    body: text(20000, 20),
    language: supportedLanguage,
    sourceName: text(200),
    sourceUrl: z.string().url().max(500).optional(),
    tags: z.array(text(40)).max(20).default([]),
  })
  .strict();
export type HealthContentInput = z.infer<typeof healthContentSchema>;

export const reviewHealthContentSchema = z.object({ status: z.enum(CONTENT_STATUSES) }).strict();
export type ReviewHealthContentInput = z.infer<typeof reviewHealthContentSchema>;

// ---------- Notifications ----------
export const notificationPreferenceSchema = z
  .object({
    preferences: z
      .array(
        z
          .object({
            type: z.enum(NOTIFICATION_TYPES),
            channel: z.enum(NOTIFICATION_CHANNELS),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type NotificationPreferenceInput = z.infer<typeof notificationPreferenceSchema>;

export const notificationListQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional(),
});

// ---------- Analytics ----------
export const analyticsRangeQuerySchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '`from` must be before `to`' });
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

export interface OverviewMetrics {
  totalPatients: number;
  newPatientsThisMonth: number;
  todaysAppointments: number;
  completedToday: number;
  pendingAppointments: number;
  activeDoctors: number;
  openFollowUps: number;
  overdueFollowUps: number;
  appointmentTrend: { date: string; total: number; completed: number }[];
  recentActivity: { id: string; action: string; entityType: string; actorName: string; createdAt: string }[];
}

export interface AppointmentAnalytics {
  byDay: { date: string; total: number; completed: number; cancelled: number; noShow: number }[];
  totals: { total: number; completed: number; cancelled: number; noShow: number; pending: number; confirmed: number };
  completionRate: number;
  cancellationRate: number;
  noShowRate: number;
}

// ---------- Billing ----------
export const changePlanSchema = z.object({ planCode: z.enum(PLAN_CODES) }).strict();
export type ChangePlanInput = z.infer<typeof changePlanSchema>;

// ---------- Support ----------
export const createSupportTicketSchema = z
  .object({ subject: text(160), description: text(4000, 10), priority: z.enum(PRIORITIES).default('NORMAL') })
  .strict();
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const updateSupportTicketSchema = z
  .object({ status: z.enum(SUPPORT_TICKET_STATUSES), resolution: optionalText(2000) })
  .strict();
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;

export const auditQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().max(60).optional(),
  entityId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
