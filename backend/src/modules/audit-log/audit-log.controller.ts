import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuditLogService } from './audit-log.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('Audit Log')
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Permissions('security.audit-log.view')
  findAll(@Query() query: PaginationQueryDto) {
    return this.auditLogService.findAll(query);
  }
}
