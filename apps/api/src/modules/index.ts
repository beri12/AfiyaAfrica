import type { Type } from '@nestjs/common';
import { BillingModule } from './billing/billing.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ClinicsModule } from './clinics/clinics.module';
import { StaffModule } from './staff/staff.module';
import { PatientsModule } from './patients/patients.module';
import { AppointmentsModule } from './appointments/appointments.module';

/** Feature modules registered in AppModule. */
export const FEATURE_MODULES: Type[] = [
  BillingModule,
  NotificationsModule,
  ClinicsModule,
  StaffModule,
  PatientsModule,
  AppointmentsModule,
];
