import { Controller, Get, Global, Module } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { auditQuerySchema, type AuditQuery } from '@afyalink/shared';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodQuery } from '../../common/pipes/zod';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(@Tenant() t: TenantContext, @ZodQuery(auditQuerySchema) q: AuditQuery) {
    return this.audit.list(t.clinicId, q);
  }
}

@Global()
@Module({ controllers: [AuditController], providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
