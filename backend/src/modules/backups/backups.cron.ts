import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupsService } from './backups.service';
import { BackupTrigger } from './entities/backup-record.entity';

/**
 * Follows the same plain-@Cron-on-@Injectable-service shape as InstallmentsNotificationCron —
 * no separate scheduler abstraction. The schedule is read from BACKUP_CRON_SCHEDULE directly at
 * decoration time (decorators evaluate at class-definition/import time, before ConfigService is
 * available), defaulting to every day at 2:00 AM — a low-traffic hour chosen so the pg_dump run
 * doesn't compete with the system's daytime workload.
 */
@Injectable()
export class BackupsCron {
  private readonly logger = new Logger(BackupsCron.name);

  constructor(private readonly backupsService: BackupsService) {}

  @Cron(process.env.BACKUP_CRON_SCHEDULE || '0 2 * * *')
  async runScheduledBackup(): Promise<void> {
    try {
      await this.backupsService.createBackup(BackupTrigger.SCHEDULED);
    } catch (err) {
      // BackupsService already recorded + notified the failure; just keep the cron loop alive.
      this.logger.error(`Scheduled backup failed: ${(err as Error).message}`);
    }
  }
}
