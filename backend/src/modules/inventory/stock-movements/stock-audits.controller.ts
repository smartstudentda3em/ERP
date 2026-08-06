import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { StockAuditsService } from './stock-audits.service';
import { ApproveStockAuditDto, CreateStockAuditDto, UpdateStockAuditDto } from './dto/stock-audit.dto';

@ApiTags('Inventory - Stock Audits')
@Controller('inventory/stock-audits')
export class StockAuditsController {
  constructor(private readonly service: StockAuditsService) {}

  @Get()
  @Permissions('inventory.stockAudit.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  @Get(':id')
  @Permissions('inventory.stockAudit.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('inventory.stockAudit.create')
  create(@Body() dto: CreateStockAuditDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('inventory.stockAudit.edit')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStockAuditDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.companyId!, user.userId);
  }

  @Delete(':id')
  @Permissions('inventory.stockAudit.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.companyId!, user.userId);
  }

  @Post(':id/approve')
  @Permissions('inventory.stockAudit.approve')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveStockAuditDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.approve(id, user.companyId!, user.userId, dto);
  }
}
