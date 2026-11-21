import { Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import {
  createLaboratorySchema,
  createLabOrderSchema,
  labOrderListQuerySchema,
  recordLabResultSchema,
  updateLabOrderStatusSchema,
  type CreateLaboratoryInput,
  type CreateLabOrderInput,
  type LabOrderListQuery,
  type RecordLabResultInput,
  type UpdateLabOrderStatusInput,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { Errors } from '../../common/http/errors';
import { paginate, skipTake } from '../../common/http/pagination';
import { RequirePermissions, Tenant, type TenantContext } from '../../common/decorators/access';
import { ZodBody, ZodQuery } from '../../common/pipes/zod';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ClinicalModule } from '../clinical/clinical.module';
import { ClinicalAccessService } from '../clinical/clinical-access.service';

/** Minimum patient info lab staff need to match samples — no history, notes or contact details. */
const ORDER_SELECT = {
  id: true,
  testName: true,
  priority: true,
  instructions: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  laboratory: { select: { id: true, name: true } },
  patient: { select: { id: true, firstName: true, lastName: true, medicalRecordNumber: true, dateOfBirth: true, sex: true } },
  orderedBy: { select: { id: true, firstName: true, lastName: true } },
  result: { select: { id: true, resultTextEnc: true, unit: true, referenceRange: true, abnormal: true, createdAt: true } },
} satisfies Prisma.LaboratoryOrderSelect;

type OrderRow = Prisma.LaboratoryOrderGetPayload<{ select: typeof ORDER_SELECT }>;

const ALLOWED_STATUS_FLOW: Record<string, string[]> = {
  ORDERED: ['SAMPLE_COLLECTED', 'CANCELLED'],
  SAMPLE_COLLECTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['CANCELLED'],
};

@Injectable()
export class LaboratoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: EncryptionService,
    private readonly access: ClinicalAccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Result content is only revealed to lab staff and doctors with a care relationship. */
  private present(t: TenantContext, o: OrderRow, careIds?: Set<string>) {
    const canSeeResult = t.role === 'LABORATORY_STAFF' || (t.role === 'DOCTOR' && careIds?.has(o.patient.id));
    const { result, ...rest } = o;
    return {
      ...rest,
      result: result
        ? canSeeResult
          ? { ...result, resultTextEnc: undefined, resultText: this.crypto.decrypt(result.resultTextEnc) }
          : { id: result.id, createdAt: result.createdAt, restricted: true }
        : null,
    };
  }

  listLabs(clinicId: string) {
    return this.prisma.laboratory.findMany({ where: { clinicId, active: true }, orderBy: { name: 'asc' } });
  }

  async createLab(t: TenantContext, input: CreateLaboratoryInput) {
    const lab = await this.prisma.laboratory.create({ data: { ...input, clinicId: t.clinicId } });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'laboratory.created', entityType: 'Laboratory', entityId: lab.id });
    return lab;
  }

  async createOrder(t: TenantContext, input: CreateLabOrderInput) {
    await this.access.assertCareAccess(t, input.patientId);
    const lab = await this.prisma.laboratory.findFirst({ where: { id: input.laboratoryId, clinicId: t.clinicId, active: true } });
    if (!lab) throw Errors.notFound('Laboratory');
    const order = await this.prisma.laboratoryOrder.create({
      data: { ...input, clinicId: t.clinicId, orderedById: t.userId },
      select: ORDER_SELECT,
    });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'lab_order.created', entityType: 'LaboratoryOrder', entityId: order.id });
    return this.present(t, order, new Set([input.patientId]));
  }

  async listOrders(t: TenantContext, q: LabOrderListQuery) {
    const where: Prisma.LaboratoryOrderWhereInput = {
      clinicId: t.clinicId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.patientId ? { patientId: q.patientId } : {}),
    };
    let careIds: Set<string> | undefined;
    if (t.role === 'DOCTOR') {
      careIds = new Set(await this.access.careDoctorPatientIds(t));
      where.patientId = q.patientId ? (careIds.has(q.patientId) ? q.patientId : '00000000-0000-0000-0000-000000000000') : { in: [...careIds] };
    }
    const [items, total] = await Promise.all([
      this.prisma.laboratoryOrder.findMany({ where, select: ORDER_SELECT, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], ...skipTake(q) }),
      this.prisma.laboratoryOrder.count({ where }),
    ]);
    return paginate(items.map((o) => this.present(t, o, careIds)), total, q);
  }

  async updateStatus(t: TenantContext, id: string, input: UpdateLabOrderStatusInput) {
    const order = await this.prisma.laboratoryOrder.findFirst({ where: { id, clinicId: t.clinicId } });
    if (!order) throw Errors.notFound('Lab order');
    if (!ALLOWED_STATUS_FLOW[order.status]?.includes(input.status)) {
      throw Errors.conflict('INVALID_STATUS_TRANSITION', `Cannot move a ${order.status} order to ${input.status}`);
    }
    const updated = await this.prisma.laboratoryOrder.update({ where: { id }, data: { status: input.status }, select: ORDER_SELECT });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'lab_order.status_changed', entityType: 'LaboratoryOrder', entityId: id, metadata: { from: order.status, to: input.status } });
    return this.present(t, updated);
  }

  async recordResult(t: TenantContext, id: string, input: RecordLabResultInput) {
    const order = await this.prisma.laboratoryOrder.findFirst({ where: { id, clinicId: t.clinicId } });
    if (!order) throw Errors.notFound('Lab order');
    if (!['SAMPLE_COLLECTED', 'IN_PROGRESS'].includes(order.status)) {
      throw Errors.conflict('INVALID_STATUS_TRANSITION', 'Results can only be recorded after sample collection');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.laboratoryResult.create({
        data: {
          orderId: id,
          resultTextEnc: this.crypto.encrypt(input.resultText),
          unit: input.unit,
          referenceRange: input.referenceRange,
          abnormal: input.abnormal,
          recordedById: t.userId,
        },
      });
      const u = await tx.laboratoryOrder.update({ where: { id }, data: { status: 'RESULTED' }, select: ORDER_SELECT });
      await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'lab_result.recorded', entityType: 'LaboratoryOrder', entityId: id }, tx);
      return u;
    });
    await this.notifications.notifyUsers([order.orderedById], {
      clinicId: t.clinicId,
      type: 'LAB_RESULT_READY',
      title: 'Lab result ready',
      body: `A result for "${order.testName}" is ready for review.`,
      link: '/app/lab',
    });
    return this.present(t, updated);
  }
}

@ApiTags('Laboratories')
@Controller('lab')
export class LaboratoriesController {
  constructor(private readonly labs: LaboratoriesService) {}

  @Get('laboratories')
  @RequirePermissions('clinic:read')
  list(@Tenant() t: TenantContext) {
    return this.labs.listLabs(t.clinicId);
  }

  @Post('laboratories')
  @RequirePermissions('clinic:update')
  createLab(@Tenant() t: TenantContext, @ZodBody(createLaboratorySchema) body: CreateLaboratoryInput) {
    return this.labs.createLab(t, body);
  }

  @Post('orders')
  @RequirePermissions('lab:order')
  createOrder(@Tenant() t: TenantContext, @ZodBody(createLabOrderSchema) body: CreateLabOrderInput) {
    return this.labs.createOrder(t, body);
  }

  @Get('orders')
  @RequirePermissions('lab:read')
  listOrders(@Tenant() t: TenantContext, @ZodQuery(labOrderListQuerySchema) q: LabOrderListQuery) {
    return this.labs.listOrders(t, q);
  }

  @Patch('orders/:id/status')
  @RequirePermissions('lab:result')
  updateStatus(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(updateLabOrderStatusSchema) body: UpdateLabOrderStatusInput) {
    return this.labs.updateStatus(t, id, body);
  }

  @Post('orders/:id/result')
  @RequirePermissions('lab:result')
  recordResult(@Tenant() t: TenantContext, @Param('id', ParseUUIDPipe) id: string, @ZodBody(recordLabResultSchema) body: RecordLabResultInput) {
    return this.labs.recordResult(t, id, body);
  }
}

@Module({ imports: [ClinicalModule], controllers: [LaboratoriesController], providers: [LaboratoriesService] })
export class LaboratoriesModule {}
