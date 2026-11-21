import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { AppConfig } from '../../config/config.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { AppointmentsService } from '../appointments/appointments.service';
import { BillingService } from '../billing/billing.service';
import { FollowUpsModule } from '../followups/followups.module';
import { FollowUpsService } from '../followups/followups.module';
import { NotificationsService } from '../notifications/notifications.service';
import { QUEUES, type AppointmentReminderJob, type DeliverNotificationJob } from './queues';
import { RetentionService } from './retention.service';

/**
 * Workers are created with autorun disabled and started only when WORKERS_ENABLED=true, so the same image can
 * run as API-only or API+worker.
 */
abstract class ConditionalWorker extends WorkerHost implements OnApplicationBootstrap {
  protected abstract readonly config: AppConfig;
  onApplicationBootstrap(): void {
    if (this.config.get('WORKERS_ENABLED')) void this.worker.run();
  }
}

@Processor(QUEUES.notifications, { autorun: false, concurrency: 5 })
export class NotificationsProcessor extends ConditionalWorker {
  constructor(
    private readonly notifications: NotificationsService,
    protected readonly config: AppConfig,
  ) {
    super();
  }
  async process(job: Job<DeliverNotificationJob>): Promise<void> {
    try {
      await this.notifications.deliver(job.data.notificationId);
    } catch (e) {
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await this.notifications.markFailed(job.data.notificationId, (e as Error).message);
      }
      throw e;
    }
  }
}

@Processor(QUEUES.reminders, { autorun: false })
export class RemindersProcessor extends ConditionalWorker {
  constructor(
    private readonly appointments: AppointmentsService,
    protected readonly config: AppConfig,
  ) {
    super();
  }
  async process(job: Job<AppointmentReminderJob>): Promise<string> {
    return this.appointments.sendReminder(job.data);
  }
}

@Processor(QUEUES.maintenance, { autorun: false })
export class MaintenanceProcessor extends ConditionalWorker {
  private readonly logger = new Logger(MaintenanceProcessor.name);
  constructor(
    private readonly followUps: FollowUpsService,
    private readonly billing: BillingService,
    private readonly retention: RetentionService,
    private readonly notifications: NotificationsService,
    protected readonly config: AppConfig,
  ) {
    super();
  }
  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'follow-up-reminders':
        return this.followUps.sendDueReminders();
      case 'generate-invoices':
        return this.billing.generateDueInvoices();
      case 'retention-purge':
        return this.retention.purge();
      case 'requeue-notifications':
        return this.notifications.requeueStale();
      default:
        this.logger.warn(`Unknown maintenance job ${job.name}`);
        return null;
    }
  }
}

/** Registers repeatable maintenance jobs (idempotent: BullMQ de-duplicates by scheduler id). */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(MaintenanceScheduler.name);
  constructor(
    @InjectQueue(QUEUES.maintenance) private readonly queue: Queue,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('WORKERS_ENABLED')) return;
    const schedules: [string, string][] = [
      ['follow-up-reminders', '0 5 * * *'], // 08:00 Addis Ababa
      ['generate-invoices', '30 0 * * *'],
      ['retention-purge', '0 1 * * *'],
      ['requeue-notifications', '*/10 * * * *'],
    ];
    try {
      for (const [name, pattern] of schedules) {
        await this.queue.upsertJobScheduler(name, { pattern, tz: 'UTC' }, { name, opts: { removeOnComplete: 50, removeOnFail: 100 } });
      }
    } catch (e) {
      this.logger.error(`Could not register maintenance schedules: ${(e as Error).message}`);
    }
  }
}

@Module({
  imports: [AppointmentsModule, FollowUpsModule],
  providers: [NotificationsProcessor, RemindersProcessor, MaintenanceProcessor, MaintenanceScheduler, RetentionService],
  exports: [RetentionService],
})
export class JobsModule {}
