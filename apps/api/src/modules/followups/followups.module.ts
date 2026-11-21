import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import {
  createFollowUpSchema,
  followUpListQuerySchema,
  updateFollowUpSchema,
  type CreateFollowUpInput,
  type FollowUpListQuery,
  type UpdateFollowUpInput,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { paginate, skipTake } from '../../common/http/pagination';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodBody, ZodQuery } from '../../common/pipes/zod';
import { zonedDateString } from '../../common/time';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PatientsModule } from '../patients/patients.module';
import { PatientsService } from '../patients/patients.service';

const FOLLOW_UP_SELECT = {
  id: true,
  title: true,
  details: true,
  dueDate: true,
  priority: true,
  status: true,
  completedAt: true,
  createdAt: true,
  patient: { select: { id: true, firstName: true, lastName: true, medicalRecordNumber: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.FollowUpSelect;

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly patients: PatientsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async assertAssignee(clinicId: string, userId: string | null | undefined): Promise<void> {
    if (!userId) return;
    const m = await this.prisma.clinicMembership.count({
      where: { clinicId, userId, status: 'ACTIVE', deletedAt: null, role: { not: 'PATIENT' } },
    });
    if (!m) throw Errors.badRequest('INVALID_ASSIGNEE', 'Assignee must be an active staff member of this clinic');
  }

  async create(t: TenantContext, input: CreateFollowUpInput) {
    await this.patients.findVisibleOrThrow(t, input.patientId);
    await this.assertAssignee(t.clinicId, input.assignedToUserId);
    const f = await this.prisma.followUp.create({
      data: {
        clinicId: t.clinicId,
        patientId: input.patientId,
        title: input.title,
        details: input.details,
        dueDate: new Date(`${input.dueDate}T00:00:00Z`),
        priority: input.priority,
        assignedToUserId: input.assignedToUserId,
        createdById: t.userId,
      },
      select: FOLLOW_UP_SELECT,
    });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'follow_up.created', entityType: 'FollowUp', entityId: f.id });
    if (input.assignedToUserId && input.assignedToUserId !== t.userId) {
      await this.notifications.notifyUsers([input.assignedToUserId], {
        clinicId: t.clinicId,
        type: 'FOLLOW_UP_DUE',
        title: 'New follow-up task assigned',
        body: `A follow-up task is due on ${input.dueDate}.`,
        link: '/app/follow-ups',
      });
    }
    return f;
  }

  async list(t: TenantContext, q: FollowUpListQuery) {
    const where: Prisma.FollowUpWhereInput = {
      clinicId: t.clinicId,
      patient: await this.patients.visibilityWhere(t),
      ...(q.status ? { status: q.status } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}),
      ...(q.mine ? { assignedToUserId: t.userId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.followUp.findMany({ where, select: FOLLOW_UP_SELECT, orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }], ...skipTake(q) }),
      this.prisma.followUp.count({ where }),
    ]);
    return paginate(items, total, q);
  }

  async update(t: TenantContext, id: string, input: UpdateFollowUpInput) {
    const existing = await this.prisma.followUp.findFirst({ where: { id, clinicId: t.clinicId, patient: await this.patients.visibilityWhere(t) } });
    if (!existing) throw Errors.notFound('Follow-up');
    await this.assertAssignee(t.clinicId, input.assignedToUserId);
    const { dueDate, ...rest } = input;
    const f = await this.prisma.followUp.update({
      where: { id },
      data: {
        ...rest,
        ...(dueDate ? { dueDate: new Date(`${dueDate}T00:00:00Z`), reminderSentAt: null } : {}),
        ...(input.status === 'DONE' ? { completedAt: new Date() } : input.status ? { completedAt: null } : {}),
      },
      select: FOLLOW_UP_SELECT,
    });
    await this.audit.log({
      clinicId: t.clinicId,
      actorUserId: t.userId,
      action: 'follow_up.updated',
      entityType: 'FollowUp',
      entityId: id,
      metadata: { status: input.status },
    });
    return f;
  }

  /** Daily job: notify assignees about follow-ups due today or overdue (once per task). */
  async sendDueReminders(now = new Date()): Promise<number> {
    const due = await this.prisma.followUp.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, reminderSentAt: null, assignedToUserId: { not: null } },
      include: { clinic: { select: { timezone: true } } },
      take: 1000,
    });
    let sent = 0;
    for (const f of due) {
      const today = zonedDateString(now, f.clinic.timezone);
      if (f.dueDate.toISOString().slice(0, 10) > today) continue;
      await this.notifications.notifyUsers([f.assignedToUserId!], {
        clinicId: f.clinicId,
        type: 'FOLLOW_UP_DUE',
        title: 'Follow-up task due',
        body: `"${f.title}" is due ${f.dueDate.toISOString().slice(0, 10)}.`,
        link: '/app/follow-ups',
      });
      await this.prisma.followUp.update({ where: { id: f.id }, data: { reminderSentAt: now } });
      sent++;
    }
    return sent;
  }
}

@ApiTags('Follow-ups')
@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpsService) {}

  @Post()
  @RequirePermissions('followup:manage')
  create(@Tenant() t: TenantContext, @ZodBody(createFollowUpSchema) body: CreateFollowUpInput) {
    return this.followUps.create(t, body);
  }

  @Get()
  @RequirePermissions('followup:read')
  list(@Tenant() t: TenantContext, @ZodQuery(followUpListQuerySchema) q: FollowUpListQuery) {
    return this.followUps.list(t, q);
  }

  @Patch(':id')
  @RequirePermissions('followup:manage')
  update(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updateFollowUpSchema) body: UpdateFollowUpInput) {
    return this.followUps.update(t, id, body);
  }
}

@Module({ imports: [PatientsModule], controllers: [FollowUpsController], providers: [FollowUpsService], exports: [FollowUpsService] })
export class FollowUpsModule {}
