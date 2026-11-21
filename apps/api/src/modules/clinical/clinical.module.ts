import { Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  amendNoteSchema,
  createNoteSchema,
  noteListQuerySchema,
  signNoteSchema,
  updateNoteDraftSchema,
  updatePatientRecordSchema,
  type AmendNoteInput,
  type CreateNoteInput,
  type NoteListQuery,
  type SignNoteInput,
  type UpdateNoteDraftInput,
  type UpdatePatientRecordInput,
} from '@afyalink/shared';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodBody, ZodQuery } from '../../common/pipes/zod';
import { ClinicalAccessService } from './clinical-access.service';
import { ClinicalNotesService } from './clinical-notes.service';

@ApiTags('Clinical records')
@Controller()
export class ClinicalController {
  constructor(private readonly notes: ClinicalNotesService) {}

  @Post('clinical-notes')
  @RequirePermissions('clinical:write')
  create(@Tenant() t: TenantContext, @ZodBody(createNoteSchema) body: CreateNoteInput) {
    return this.notes.create(t, body);
  }

  @Get('clinical-notes')
  @RequirePermissions('clinical:read')
  list(@Tenant() t: TenantContext, @ZodQuery(noteListQuerySchema) q: NoteListQuery) {
    return this.notes.list(t, q);
  }

  @Get('clinical-notes/:id')
  @RequirePermissions('clinical:read')
  get(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.get(t, id);
  }

  @Patch('clinical-notes/:id')
  @RequirePermissions('clinical:write')
  update(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updateNoteDraftSchema) body: UpdateNoteDraftInput) {
    return this.notes.updateDraft(t, id, body);
  }

  @Post('clinical-notes/:id/submit')
  @RequirePermissions('clinical:write')
  @HttpCode(200)
  submit(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.submitForReview(t, id);
  }

  @Post('clinical-notes/:id/sign')
  @RequirePermissions('clinical:sign')
  @HttpCode(200)
  @ApiOperation({ summary: 'Sign the current version (requires clinician attestation)' })
  sign(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(signNoteSchema) _body: SignNoteInput) {
    return this.notes.sign(t, id);
  }

  @Post('clinical-notes/:id/amend')
  @RequirePermissions('clinical:sign')
  @HttpCode(200)
  amend(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(amendNoteSchema) body: AmendNoteInput) {
    return this.notes.amend(t, id, body);
  }

  @Get('patients/:id/record')
  @RequirePermissions('clinical:read')
  record(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.notes.getRecord(t, id);
  }

  @Put('patients/:id/record')
  @RequirePermissions('clinical:write')
  updateRecord(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updatePatientRecordSchema) body: UpdatePatientRecordInput) {
    return this.notes.updateRecord(t, id, body);
  }
}

@Module({
  controllers: [ClinicalController],
  providers: [ClinicalNotesService, ClinicalAccessService],
  exports: [ClinicalNotesService, ClinicalAccessService],
})
export class ClinicalModule {}
