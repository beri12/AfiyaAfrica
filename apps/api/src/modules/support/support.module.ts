import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createSupportTicketSchema,
  updateSupportTicketSchema,
  type CreateSupportTicketInput,
  type UpdateSupportTicketInput,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { CurrentUser, PlatformAdmin, RequirePermissions, Tenant, type AuthUser, type TenantContext } from '../../common/decorators/access';
import { ZodBody } from '../../common/pipes/zod';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(t: TenantContext, input: CreateSupportTicketInput) {
    const ticket = await this.prisma.supportTicket.create({ data: { ...input, clinicId: t.clinicId, createdById: t.userId } });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'support.ticket_created', entityType: 'SupportTicket', entityId: ticket.id });
    const admins = await this.prisma.userRole.findMany({ where: { role: { key: 'PLATFORM_ADMIN' } }, select: { userId: true } });
    await this.notifications.notifyUsers(admins.map((a) => a.userId), {
      type: 'SYSTEM',
      title: 'New support ticket',
      body: `${input.priority} priority: ${input.subject}`,
      link: '/admin/support',
    });
    return ticket;
  }

  listForClinic(clinicId: string, userId: string) {
    return this.prisma.supportTicket.findMany({ where: { clinicId, createdById: userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  listAll() {
    return this.prisma.supportTicket.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: { clinic: { select: { name: true } }, createdBy: { select: { firstName: true, lastName: true, email: true } } },
    });
  }

  async update(actorUserId: string, id: string, input: UpdateSupportTicketInput) {
    const existing = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('Support ticket');
    const ticket = await this.prisma.supportTicket.update({ where: { id }, data: input });
    await this.notifications.notifyUsers([existing.createdById], {
      clinicId: existing.clinicId,
      type: 'SYSTEM',
      title: 'Support ticket updated',
      body: `"${existing.subject}" is now ${input.status.replace('_', ' ').toLowerCase()}.`,
      link: '/app/settings',
    });
    await this.audit.log({ actorUserId, clinicId: existing.clinicId, action: 'support.ticket_updated', entityType: 'SupportTicket', entityId: id, metadata: { status: input.status } });
    return ticket;
  }
}

@ApiTags('Support')
@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('support-tickets')
  @RequirePermissions('support:create')
  create(@Tenant() t: TenantContext, @ZodBody(createSupportTicketSchema) body: CreateSupportTicketInput) {
    return this.support.create(t, body);
  }

  @Get('support-tickets')
  @RequirePermissions('support:create')
  mine(@Tenant() t: TenantContext) {
    return this.support.listForClinic(t.clinicId, t.userId);
  }

  @Get('platform/support-tickets')
  @PlatformAdmin()
  all() {
    return this.support.listAll();
  }

  @Patch('platform/support-tickets/:id')
  @PlatformAdmin()
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updateSupportTicketSchema) body: UpdateSupportTicketInput) {
    return this.support.update(u.id, id, body);
  }
}

@Module({ controllers: [SupportController], providers: [SupportService] })
export class SupportModule {}
