import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackupRecord } from './entities/backup-record.entity';
import { User } from '../users/entities/user.entity';
import { BackupsService } from './backups.service';
import { BackupsController } from './backups.controller';
import { BackupsCron } from './backups.cron';
import { BackupNotificationsService } from './backup-notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([BackupRecord, User])],
  controllers: [BackupsController],
  providers: [BackupsService, BackupsCron, BackupNotificationsService],
})
export class BackupsModule {}
