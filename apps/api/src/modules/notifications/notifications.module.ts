import { Controller, Get, Global, HttpCode, Module, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ApiTags } from '@nestjs/swagger';
import {
  notificationListQuerySchema,
  notificationPreferenceSchema,
  type NotificationPreferenceInput,
  type PaginationQuery,
} from '@afyalink/shared';
import { Authenticated, CurrentUser, type AuthUser } from '../../common/decorators/access';
import { ZodBody, ZodQuery } from '../../common/pipes/zod';
import { QUEUES } from '../jobs/queues';
import { NotificationsService } from './notifications.service';
import { AfricasTalkingSmsProvider, EmailProvider, SmsProvider, SmtpEmailProvider } from './providers';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Authenticated()
  list(@CurrentUser() u: AuthUser, @ZodQuery(notificationListQuerySchema) q: PaginationQuery & { unreadOnly?: boolean }) {
    return this.notifications.list(u.id, q);
  }

  @Post(':id/read')
  @Authenticated()
  @HttpCode(204)
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.notifications.markRead(u.id, id);
  }

  @Post('read-all')
  @Authenticated()
  @HttpCode(204)
  async readAll(@CurrentUser() u: AuthUser): Promise<void> {
    await this.notifications.markAllRead(u.id);
  }

  @Get('preferences')
  @Authenticated()
  preferences(@CurrentUser() u: AuthUser) {
    return this.notifications.getPreferences(u.id);
  }

  @Put('preferences')
  @Authenticated()
  setPreferences(@CurrentUser() u: AuthUser, @ZodBody(notificationPreferenceSchema) body: NotificationPreferenceInput) {
    return this.notifications.setPreferences(u.id, body);
  }
}

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.notifications }, { name: QUEUES.reminders }, { name: QUEUES.maintenance })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    { provide: EmailProvider, useClass: SmtpEmailProvider },
    { provide: SmsProvider, useClass: AfricasTalkingSmsProvider },
  ],
  exports: [NotificationsService, BullModule],
})
export class NotificationsModule {}
