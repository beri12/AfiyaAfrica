export const QUEUES = {
  notifications: 'notifications',
  reminders: 'reminders',
  maintenance: 'maintenance',
} as const;

export interface DeliverNotificationJob {
  notificationId: string;
}

export interface AppointmentReminderJob {
  appointmentId: string;
  /** Start time the reminder was scheduled for; the job is ignored if the appointment moved. */
  startAt: string;
}

export function appointmentReminderJobId(appointmentId: string, startAt: Date): string {
  return `appt-reminder_${appointmentId}_${startAt.getTime()}`;
}
