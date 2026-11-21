import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  aiAssistantSchema,
  aiClinicalDraftSchema,
  aiHealthInfoSchema,
  aiReviewSchema,
  CONTENT_STATUSES,
  healthContentSchema,
  reviewHealthContentSchema,
  type AiAssistantInput,
  type AiClinicalDraftInput,
  type AiHealthInfoInput,
  type AiReviewInput,
  type HealthContentInput,
  type ReviewHealthContentInput,
} from '@afyalink/shared';
import {
  Authenticated,
  CurrentUser,
  PlatformAdmin,
  RequirePermissions,
  Tenant,
  type AuthUser,
  type TenantContext,
} from '../../common/decorators/access';
import { ZodBody } from '../../common/pipes/zod';
import { Errors } from '../../common/http/errors';
import { ClinicalModule } from '../clinical/clinical.module';
import { AiProvider, OpenAiCompatibleProvider } from './ai.provider';
import { AiService } from './ai.service';

@ApiTags('AI assistant')
@Controller('ai')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  @Authenticated()
  status() {
    return this.ai.status();
  }

  @Post('assistant')
  @RequirePermissions('ai:admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Platform/workflow help for staff. No patient data.' })
  assistant(@Tenant() t: TenantContext, @ZodBody(aiAssistantSchema) body: AiAssistantInput) {
    return this.ai.adminAssistant(t, body);
  }

  @Post('clinical-draft')
  @RequirePermissions('ai:clinical', 'clinical:write')
  @HttpCode(200)
  @ApiOperation({ summary: 'Structure doctor-provided notes into a labelled DRAFT that requires clinician review and signature.' })
  clinicalDraft(@Tenant() t: TenantContext, @ZodBody(aiClinicalDraftSchema) body: AiClinicalDraftInput) {
    return this.ai.clinicalDraft(t, body);
  }

  @Post('health-info')
  @Authenticated()
  @HttpCode(200)
  @ApiOperation({ summary: 'General health education grounded only in approved sources. Not medical advice.' })
  healthInfo(@CurrentUser() u: AuthUser, @ZodBody(aiHealthInfoSchema) body: AiHealthInfoInput) {
    return this.ai.healthInfo(u.id, body);
  }

  @Post('reviews')
  @RequirePermissions('ai:clinical')
  review(@Tenant() t: TenantContext, @ZodBody(aiReviewSchema) body: AiReviewInput) {
    return this.ai.review(t, body);
  }

  @Get('usage')
  @RequirePermissions('analytics:read')
  usage(@Tenant() t: TenantContext) {
    return this.ai.usage(t.clinicId);
  }
}

@ApiTags('Platform administration')
@Controller('platform/health-content')
export class HealthContentController {
  constructor(private readonly ai: AiService) {}

  @Get()
  @PlatformAdmin()
  @ApiQuery({ name: 'status', required: false, enum: CONTENT_STATUSES })
  list(@Query('status') status?: string) {
    if (status && !(CONTENT_STATUSES as readonly string[]).includes(status)) throw Errors.badRequest('VALIDATION_FAILED', 'Invalid status');
    return this.ai.listContent(status);
  }

  @Post()
  @PlatformAdmin()
  create(@CurrentUser() u: AuthUser, @ZodBody(healthContentSchema) body: HealthContentInput) {
    return this.ai.createContent(u.id, body);
  }

  @Patch(':id')
  @PlatformAdmin()
  review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZodBody(reviewHealthContentSchema) body: ReviewHealthContentInput) {
    return this.ai.reviewContent(u.id, id, body);
  }
}

@Module({
  imports: [ClinicalModule],
  controllers: [AiController, HealthContentController],
  providers: [AiService, { provide: AiProvider, useClass: OpenAiCompatibleProvider }],
})
export class AiModule {}
