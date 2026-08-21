import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SharedDocumentsService } from './shared-documents.service';

/** Same plain-@Cron-on-@Injectable-service shape as BackupsCron. Runs once a day at a low-traffic
 * hour — there's no urgency to clean these up faster, they just shouldn't accumulate forever. */
@Injectable()
export class SharedDocumentsCleanupCron {
  private readonly logger = new Logger(SharedDocumentsCleanupCron.name);

  constructor(private readonly service: SharedDocumentsService) {}

  @Cron('0 3 * * *')
  async runCleanup(): Promise<void> {
    try {
      const removed = await this.service.cleanupExpired();
      if (removed) this.logger.log(`Removed ${removed} expired shared document(s)`);
    } catch (err) {
      this.logger.error(`Shared documents cleanup failed: ${(err as Error).message}`);
    }
  }
}
