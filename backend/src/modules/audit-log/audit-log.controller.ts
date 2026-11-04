import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FounderGuard } from '../../common/guards/founder.guard';
import { AuditLogQuery, AuditLogService } from './audit-log.service';
import { AuditRecorder } from './audit-recorder.service';
import { auditStorage } from './audit-context';

/**
 * Viewing the activity trail is reserved for the founder alone — FounderGuard, not a permission, so
 * no role (including another Administrator) can be granted it. The class has GET routes only: the
 * trail can't be edited or deleted through the API, and the database refuses it too.
 */
@ApiTags('Audit Log')
@Controller('audit-logs')
@UseGuards(FounderGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(@Query() query: AuditLogQuery) {
    return this.auditLogService.findAll(query);
  }

  @Get('filter-options')
  filterOptions() {
    return this.auditLogService.filterOptions();
  }
}

class PrintEventDto {
  @IsIn(['PRINT', 'EXPORT']) kind: 'PRINT' | 'EXPORT';
  @IsOptional() @IsString() @MaxLength(150) title?: string;
  @IsOptional() @IsString() @MaxLength(200) page?: string;
}

/** Any signed-in user's print / PDF-export is reported here by the frontend (the browser prints
 * without calling the API, so it's the only way to see it). Writing is open; reading is founder-only. */
@ApiTags('Audit Log')
@Controller('audit-events')
export class AuditEventsController {
  constructor(private readonly recorder: AuditRecorder) {}

  @Post()
  async record(@Body() dto: PrintEventDto, @CurrentUser() user: AuthenticatedUser) {
    const actor = await this.recorder.snapshot(auditStorage.getStore());
    await this.recorder.insert([
      {
        companyId: user.companyId ?? null,
        userId: user.userId,
        userEmail: user.email,
        userName: user.fullName,
        userRole: actor.userRole,
        departmentName: await this.recorder.companyName(user.companyId),
        method: 'POST',
        path: '/api/audit-events',
        module: 'print',
        action: 'PRINT',
        actionType: 'PRINT',
        source: 'REQUEST',
        targetModel: null,
        targetLabel: dto.title ?? null,
        entityId: null,
        oldValues: null,
        newValues: null,
        description: `${dto.kind === 'EXPORT' ? 'تصدير PDF' : 'طباعة'}${dto.title ? ` — ${dto.title}` : ''}`,
        requestBody: dto.page ? { page: dto.page } : null,
        statusCode: 200,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        durationMs: null,
      },
    ]);
    return { ok: true };
  }
}
