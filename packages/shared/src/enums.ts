/**
 * Domain enums shared by API (mirrored in Prisma schema) and web.
 * Keep values identical to the Prisma enums — a unit test in the API enforces this.
 */
export const ROLES = [
  'PLATFORM_ADMIN',
  'CLINIC_ADMIN',
  'DOCTOR',
  'RECEPTIONIST',
  'PATIENT',
  'LABORATORY_STAFF',
] as const;
export type Role = (typeof ROLES)[number];

/** Roles that can be held inside a clinic (tenant). PLATFORM_ADMIN is platform-level only. */
export const CLINIC_ROLES = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'PATIENT', 'LABORATORY_STAFF'] as const;
export type ClinicRole = (typeof CLINIC_ROLES)[number];

/** Staff roles a clinic admin may invite. */
export const STAFF_ROLES = ['CLINIC_ADMIN', 'DOCTOR', 'RECEPTIONIST', 'LABORATORY_STAFF'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PRIVILEGED_ROLES: readonly Role[] = ['PLATFORM_ADMIN', 'CLINIC_ADMIN', 'DOCTOR'];

export const CLINIC_STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED'] as const;
export type ClinicStatus = (typeof CLINIC_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['INVITED', 'ACTIVE', 'DISABLED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that occupy a doctor's time slot. */
export const ACTIVE_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ['PENDING', 'CONFIRMED'];

export const NOTE_STATUSES = ['DRAFT', 'IN_REVIEW', 'SIGNED', 'AMENDED'] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const NOTE_SOURCES = ['CLINICIAN', 'AI_ASSISTED'] as const;
export type NoteSource = (typeof NOTE_SOURCES)[number];

export const PATIENT_STATUSES = ['ACTIVE', 'INACTIVE', 'DECEASED', 'TRANSFERRED'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const SEXES = ['FEMALE', 'MALE', 'INTERSEX', 'UNDISCLOSED'] as const;
export type Sex = (typeof SEXES)[number];

export const CONSENT_TYPES = [
  'DATA_PROCESSING',
  'SMS_REMINDERS',
  'EMAIL_REMINDERS',
  'AI_ASSISTED_DOCUMENTATION',
  'PORTAL_RECORD_ACCESS',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const FOLLOW_UP_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const NOTIFICATION_CHANNELS = ['IN_APP', 'SMS', 'EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CHANGED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_REQUESTED',
  'FOLLOW_UP_DUE',
  'NOTE_REVIEW_REQUESTED',
  'LAB_RESULT_READY',
  'STAFF_INVITED',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const LAB_ORDER_STATUSES = ['ORDERED', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'RESULTED', 'CANCELLED'] as const;
export type LabOrderStatus = (typeof LAB_ORDER_STATUSES)[number];

export const PLAN_CODES = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const AI_FEATURES = ['ADMIN_ASSISTANT', 'CLINICAL_DRAFT', 'HEALTH_INFO'] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export const AI_REVIEW_DECISIONS = ['ACCEPTED', 'EDITED', 'REJECTED'] as const;
export type AiReviewDecision = (typeof AI_REVIEW_DECISIONS)[number];

export const LANGUAGES = ['en', 'am', 'om', 'ti'] as const;
export type Language = (typeof LANGUAGES)[number];
/** Languages with complete UI/AI support today. `om` and `ti` are architected but not yet translated. */
export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'am'];

export const SUPPORT_TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const CONTENT_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'RETIRED'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];
