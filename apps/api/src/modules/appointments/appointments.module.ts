import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  appointmentListQuerySchema,
  cancelAppointmentSchema,
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  slotsQuerySchema,
  type AppointmentListQuery,
  type CancelAppointmentInput,
  type CreateAppointmentInput,
  type RescheduleAppointmentInput,
  type SlotsQuery,
} from '@afyalink/shared';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodBody, ZodQuery } from '../../common/pipes/zod';
import { AppointmentsService } from './appointments.service';

@ApiTags('Appointments')
@Controller()
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Post('appointments')
  @RequirePermissions('appointment:create')
  create(@Tenant() t: TenantContext, @ZodBody(createAppointmentSchema) body: CreateAppointmentInput) {
    return this.appointments.create(t, body);
  }

  @Get('appointments')
  @RequirePermissions('appointment:read')
  list(@Tenant() t: TenantContext, @ZodQuery(appointmentListQuerySchema) q: AppointmentListQuery) {
    return this.appointments.list(t, q);
  }

  @Get('appointments/:id')
  @RequirePermissions('appointment:read')
  get(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.get(t, id);
  }

  @Post('appointments/:id/confirm')
  @RequirePermissions('appointment:manage')
  @HttpCode(200)
  confirm(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.transition(t, id, 'confirm');
  }

  @Post('appointments/:id/complete')
  @RequirePermissions('appointment:manage')
  @HttpCode(200)
  complete(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.transition(t, id, 'complete');
  }

  @Post('appointments/:id/no-show')
  @RequirePermissions('appointment:manage')
  @HttpCode(200)
  noShow(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointments.transition(t, id, 'no-show');
  }

  @Post('appointments/:id/cancel')
  @RequirePermissions('appointment:manage')
  @HttpCode(200)
  cancel(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(cancelAppointmentSchema) body: CancelAppointmentInput) {
    return this.appointments.cancel(t, id, body);
  }

  @Post('appointments/:id/reschedule')
  @RequirePermissions('appointment:manage')
  @HttpCode(200)
  reschedule(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(rescheduleAppointmentSchema) body: RescheduleAppointmentInput) {
    return this.appointments.reschedule(t, id, body);
  }

  @Get('doctors/:id/slots')
  @RequirePermissions('appointment:read')
  slots(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodQuery(slotsQuerySchema) q: SlotsQuery) {
    return this.appointments.slots(t, id, q.date, q.serviceId);
  }
}

@Module({ controllers: [AppointmentsController], providers: [AppointmentsService], exports: [AppointmentsService] })
export class AppointmentsModule {}
