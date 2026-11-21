import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  clinicServiceSchema,
  inviteStaffSchema,
  setAvailabilitySchema,
  updateClinicServiceSchema,
  updateStaffSchema,
  type ClinicServiceInput,
  type InviteStaffInput,
  type SetAvailabilityInput,
  type UpdateClinicServiceInput,
  type UpdateStaffInput,
} from '@afyalink/shared';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodBody } from '../../common/pipes/zod';
import { StaffService } from './staff.service';

@ApiTags('Staff')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('staff:read')
  list(@Tenant() t: TenantContext) {
    return this.staff.list(t.clinicId);
  }

  @Post()
  @RequirePermissions('staff:manage')
  invite(@Tenant() t: TenantContext, @ZodBody(inviteStaffSchema) body: InviteStaffInput) {
    return this.staff.invite(t, body);
  }

  @Patch(':id')
  @RequirePermissions('staff:manage')
  update(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updateStaffSchema) body: UpdateStaffInput) {
    return this.staff.update(t, id, body);
  }

  @Post(':id/resend-invite')
  @RequirePermissions('staff:manage')
  @HttpCode(200)
  resend(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.staff.resendInvite(t, id);
  }
}

@ApiTags('Services')
@Controller('services')
export class ServicesController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('service:read')
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  list(@Tenant() t: TenantContext, @Query('includeInactive') includeInactive?: string) {
    return this.staff.listServices(t.clinicId, includeInactive === 'true');
  }

  @Post()
  @RequirePermissions('service:manage')
  create(@Tenant() t: TenantContext, @ZodBody(clinicServiceSchema) body: ClinicServiceInput) {
    return this.staff.createService(t, body);
  }

  @Patch(':id')
  @RequirePermissions('service:manage')
  update(
    @Tenant() t: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(updateClinicServiceSchema) body: UpdateClinicServiceInput,
  ) {
    return this.staff.updateService(t, id, body);
  }

  @Delete(':id')
  @RequirePermissions('service:manage')
  @HttpCode(204)
  async archive(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.staff.archiveService(t, id);
  }
}

@ApiTags('Doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('staff:read')
  list(@Tenant() t: TenantContext) {
    return this.staff.listDoctors(t.clinicId);
  }

  @Put(':id/availability')
  @RequirePermissions('doctor:availability')
  setAvailability(
    @Tenant() t: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(setAvailabilitySchema) body: SetAvailabilityInput,
  ) {
    return this.staff.setAvailability(t, id, body);
  }
}

@Module({ controllers: [StaffController, ServicesController, DoctorsController], providers: [StaffService], exports: [StaffService] })
export class StaffModule {}
