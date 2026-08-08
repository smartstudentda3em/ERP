import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { BackupsService } from './backups.service';
import { RestoreBackupDto } from './dto/backups.dto';
import { BackupTrigger } from './entities/backup-record.entity';

@ApiTags('Backups')
@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get()
  @Permissions('admin.backup.view')
  list() {
    return this.backupsService.listBackups();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('admin.backup.create')
  create(@CurrentUser('userId') userId: string) {
    return this.backupsService.createBackup(BackupTrigger.MANUAL, userId);
  }

  @Get(':id/download')
  @Permissions('admin.backup.view')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { filePath, fileName, cleanup } = await this.backupsService.downloadBackup(id);
    res.download(filePath, fileName, (err) => {
      cleanup();
      if (err && !res.headersSent) {
        res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Download failed' });
      }
    });
  }

  // @Permissions('admin.backup.approve') is the first gate — BackupsService.restoreBackup() then
  // re-checks the caller's role and confirmation code directly, same double-gating as
  // SystemService.factoryReset(); see the comment there and on restoreBackup() for why.
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @Permissions('admin.backup.approve')
  restore(@Param('id') id: string, @CurrentUser('userId') userId: string, @Body() dto: RestoreBackupDto) {
    return this.backupsService.restoreBackup(id, userId, dto.confirmationCode);
  }

  @Delete(':id')
  @Permissions('admin.backup.delete')
  remove(@Param('id') id: string) {
    return this.backupsService.deleteBackup(id);
  }
}
