import type { Type } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClinicsModule } from './clinics/clinics.module';
import { StaffModule } from './staff/staff.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ClinicalModule } from './clinical/clinical.module';
import { FollowUpsModule } from './followups/followups.module';
import { LaboratoriesModule } from './laboratories/laboratories.module';
import { AiModule } from './ai/ai.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { PortalModule } from './portal/portal.module';
import { SupportModule } from './support/support.module';
import { JobsModule } from './jobs/jobs.module';

/** Feature modules registered in AppModule. */
export const FEATURE_MODULES: Type[] = [
  BillingModule,
  NotificationsModule,
  ClinicsModule,
  StaffModule,
  PatientsModule,
  AppointmentsModule,
  ClinicalModule,
  FollowUpsModule,
  LaboratoriesModule,
  AiModule,
  AnalyticsModule,
  PortalModule,
  SupportModule,
  JobsModule,
];
