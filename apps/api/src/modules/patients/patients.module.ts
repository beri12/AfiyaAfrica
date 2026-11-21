import { Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  assignCareSchema,
  createPatientSchema,
  patientSearchQuerySchema,
  recordConsentSchema,
  updatePatientSchema,
  type AssignCareInput,
  type CreatePatientInput,
  type PatientSearchQuery,
  type RecordConsentInput,
  type UpdatePatientInput,
} from '@afyalink/shared';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodBody, ZodQuery } from '../../common/pipes/zod';
import { PatientsService } from './patients.service';

@ApiTags('Patients')
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  @RequirePermissions('patient:create')
  create(@Tenant() t: TenantContext, @ZodBody(createPatientSchema) body: CreatePatientInput) {
    return this.patients.create(t, body);
  }

  @Get()
  @RequirePermissions('patient:read')
  search(@Tenant() t: TenantContext, @ZodQuery(patientSearchQuerySchema) q: PatientSearchQuery) {
    return this.patients.search(t, q);
  }

  @Get(':id')
  @RequirePermissions('patient:read')
  get(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.get(t, id);
  }

  @Patch(':id')
  @RequirePermissions('patient:update')
  update(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updatePatientSchema) body: UpdatePatientInput) {
    return this.patients.update(t, id, body);
  }

  @Get(':id/consents')
  @RequirePermissions('consent:manage')
  consents(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.consentHistory(t, id);
  }

  @Post(':id/consents')
  @RequirePermissions('consent:manage')
  recordConsent(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(recordConsentSchema) body: RecordConsentInput) {
    return this.patients.recordConsent(t, id, body);
  }

  @Post(':id/invite')
  @RequirePermissions('patient:invite')
  @HttpCode(200)
  invite(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.invite(t, id);
  }

  @Post(':id/care-team')
  @RequirePermissions('patient:update', 'appointment:manage')
  assign(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(assignCareSchema) body: AssignCareInput) {
    return this.patients.assignCare(t, id, body.doctorId);
  }

  @Delete(':id/care-team/:doctorId')
  @RequirePermissions('patient:update', 'appointment:manage')
  @HttpCode(204)
  async endCare(
    @Tenant() t: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('doctorId', ParseUUIDPipe) doctorId: string,
  ): Promise<void> {
    await this.patients.endCare(t, id, doctorId);
  }

  @Get(':id/access-log')
  @RequirePermissions('audit:read')
  accessLog(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.patients.accessLog(t, id);
  }
}

@Module({ controllers: [PatientsController], providers: [PatientsService], exports: [PatientsService] })
export class PatientsModule {}
