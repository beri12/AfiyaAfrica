import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditQuery } from '@afyalink/shared';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { RequestContext } from '../../common/context/request-context';
import { paginate, skipTake } from '../../common/http/pagination';

export interface AuditEntry {
  clinicId?: string | null;
  actorUserId?: string | null;
  /** Dotted verb, e.g. `patient.created`, `clinical_note.viewed`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Non-clinical, non-identifying metadata only (ids, statuses, field names). */
  metadata?: Record<string, unknown>;
}

const FORBIDDEN_METADATA_KEYS =
  /^(content|sections|notes|rawNotes|body|message|password|token|secret|resultText|allergies|medications|chronicConditions|diagnosis)$/i;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Writes an audit entry. Pass `tx` to make it atomic with the audited change. */
  async log(entry: AuditEntry, tx?: Tx): Promise<void> {
    const ctx = RequestContext.get();
    const metadata = entry.metadata ? this.sanitize(entry.metadata) : undefined;
    await (tx ?? this.prisma).auditLog.create({
      data: {
        clinicId: entry.clinicId ?? null,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: metadata as Prisma.InputJsonValue | undefined,
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
        requestId: ctx?.requestId,
      },
    });
  }

  /** Defensive: strips keys that look like they could carry clinical content or secrets. */
  sanitize(metadata: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(metadata)) {
      if (FORBIDDEN_METADATA_KEYS.test(k)) {
        this.logger.warn(`Dropped audit metadata key "${k}"`);
        continue;
      }
      out[k] = v;
    }
    return out;
  }

  async list(clinicId: string, q: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      clinicId,
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q),
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          ipAddress: true,
          actor: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, q);
  }
}
