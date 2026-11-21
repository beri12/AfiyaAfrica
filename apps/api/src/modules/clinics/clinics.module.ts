import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  CLINIC_STATUSES,
  contactMessageSchema,
  registerClinicSchema,
  reviewClinicSchema,
  updateClinicSchema,
  type ClinicStatus,
  type ContactMessageInput,
  type RegisterClinicInput,
  type ReviewClinicInput,
  type UpdateClinicInput,
} from '@afyalink/shared';
import {
  CurrentUser,
  PlatformAdmin,
  Public,
  RequirePermissions,
  RequirePermissionsPendingOk,
  Tenant,
  type AuthUser,
  type TenantContext,
} from '../../common/decorators/access';
import { ZodBody } from '../../common/pipes/zod';
import { Errors } from '../../common/http/errors';
import { ClinicsService } from './clinics.service';

@ApiTags('Clinics')
@Controller()
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @Post('clinics/register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@ZodBody(registerClinicSchema) body: RegisterClinicInput) {
    return this.clinics.register(body);
  }

  @Post('contact')
  @Public()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async contact(@ZodBody(contactMessageSchema) body: ContactMessageInput): Promise<void> {
    await this.clinics.submitContact(body);
  }

  @Get('clinic')
  @RequirePermissionsPendingOk('clinic:read')
  get(@Tenant() t: TenantContext) {
    return this.clinics.get(t.clinicId);
  }

  @Patch('clinic')
  @RequirePermissions('clinic:update')
  update(@Tenant() t: TenantContext, @ZodBody(updateClinicSchema) body: UpdateClinicInput) {
    return this.clinics.update(t.clinicId, t.userId, body);
  }
}

@ApiTags('Platform administration')
@Controller('platform')
export class PlatformController {
  constructor(private readonly clinics: ClinicsService) {}

  @Get('overview')
  @PlatformAdmin()
  overview() {
    return this.clinics.platformOverview();
  }

  @Get('clinics')
  @PlatformAdmin()
  @ApiQuery({ name: 'status', required: false, enum: CLINIC_STATUSES })
  list(@Query('status') status?: string) {
    if (status && !(CLINIC_STATUSES as readonly string[]).includes(status)) {
      throw Errors.badRequest('VALIDATION_FAILED', 'Invalid status');
    }
    return this.clinics.listForPlatform(status as ClinicStatus | undefined);
  }

  @Post('clinics/:id/review')
  @PlatformAdmin()
  @HttpCode(200)
  review(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ZodBody(reviewClinicSchema) body: ReviewClinicInput,
  ) {
    return this.clinics.review(id, u.id, body);
  }
}

@Module({ controllers: [ClinicsController, PlatformController], providers: [ClinicsService] })
export class ClinicsModule {}
