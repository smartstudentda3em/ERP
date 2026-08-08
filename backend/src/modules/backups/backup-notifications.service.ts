import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { BackupTrigger } from './entities/backup-record.entity';

export interface BackupNotifyInput {
  success: boolean;
  fileName?: string;
  sizeBytes?: number;
  trigger: BackupTrigger;
  errorMessage?: string;
}

/**
 * Always logs (success/failure) — that alone satisfies the "log" half of the alerting
 * requirement with zero configuration. Email is a pure add-on: silently skipped whenever
 * SMTP_HOST / BACKUP_ADMIN_EMAIL aren't set, so a deployment with no mail server configured
 * is unaffected.
 */
@Injectable()
export class BackupNotificationsService {
  private readonly logger = new Logger(BackupNotificationsService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('backup.smtp.host');
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: this.config.get<number>('backup.smtp.port'),
          secure: this.config.get<boolean>('backup.smtp.secure'),
          auth: this.config.get<string>('backup.smtp.user')
            ? {
                user: this.config.get<string>('backup.smtp.user'),
                pass: this.config.get<string>('backup.smtp.pass'),
              }
            : undefined,
        })
      : null;
  }

  async notify(input: BackupNotifyInput): Promise<void> {
    const triggerLabel = input.trigger === BackupTrigger.MANUAL ? 'يدوي' : 'مجدول';
    if (input.success) {
      this.logger.log(`نسخة احتياطية (${triggerLabel}) نجحت: ${input.fileName} — ${input.sizeBytes} bytes`);
    } else {
      this.logger.error(`نسخة احتياطية (${triggerLabel}) فشلت: ${input.errorMessage}`);
    }

    const to = this.config.get<string>('backup.adminEmail');
    if (!this.transporter || !to) return;

    const subject = input.success
      ? `✅ نجحت النسخة الاحتياطية لقاعدة البيانات — ${input.fileName}`
      : '❌ فشلت النسخة الاحتياطية لقاعدة البيانات';
    const text = input.success
      ? `تم إنشاء نسخة احتياطية بنجاح.\nالملف: ${input.fileName}\nالحجم: ${input.sizeBytes} bytes\nنوع التشغيل: ${triggerLabel}`
      : `فشلت عملية النسخ الاحتياطي.\nالسبب: ${input.errorMessage}\nنوع التشغيل: ${triggerLabel}`;

    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('backup.smtp.from'),
        to,
        subject,
        text,
      });
    } catch (err) {
      this.logger.error(`Failed to send backup notification email: ${(err as Error).message}`);
    }
  }
}
