import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Data retention policy (see docs/privacy.md). Operational/derived data is purged on a schedule; clinical
 * records, consents and audit logs are retained per the clinic's legal obligations and are NOT purged here.
 */
export const RETENTION = {
  expiredSessionsDays: 30,
  consumedActionTokensDays: 30,
  readNotificationsDays: 180,
  aiInteractionMetadataDays: 365,
  handledContactMessagesDays: 365,
} as const;

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async purge(now = new Date()): Promise<Record<string, number>> {
    const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const [sessions, tokens, notifications, ai, contact] = await Promise.all([
      this.prisma.session.deleteMany({
        where: { OR: [{ expiresAt: { lt: ago(RETENTION.expiredSessionsDays) } }, { revokedAt: { lt: ago(RETENTION.expiredSessionsDays) } }] },
      }),
      this.prisma.actionToken.deleteMany({
        where: { OR: [{ consumedAt: { lt: ago(RETENTION.consumedActionTokensDays) } }, { expiresAt: { lt: ago(RETENTION.consumedActionTokensDays) } }] },
      }),
      this.prisma.notification.deleteMany({ where: { readAt: { lt: ago(RETENTION.readNotificationsDays) } } }),
      this.prisma.aIInteraction.deleteMany({ where: { createdAt: { lt: ago(RETENTION.aiInteractionMetadataDays) }, reviews: { none: {} } } }),
      this.prisma.contactMessage.deleteMany({ where: { handledAt: { lt: ago(RETENTION.handledContactMessagesDays) } } }),
    ]);
    const result = {
      sessions: sessions.count,
      actionTokens: tokens.count,
      notifications: notifications.count,
      aiInteractions: ai.count,
      contactMessages: contact.count,
    };
    this.logger.log(`Retention purge: ${JSON.stringify(result)}`);
    return result;
  }
}
