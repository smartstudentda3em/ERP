import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
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

  // Declared before ':id' so 'setup-lines' is never swallowed by the :id param route.
  @Get('setup-lines')
  @Permissions('inventory.stockAudit.create')
  getSetupLines(
    @Query('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query('auditDate') auditDate: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.getSetupLines(companyId, warehouseId, auditDate);
  }

  @Get(':id')
  @Permissions('inventory.stockAudit.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('inventory.stockAudit.create')
  create(@Body() dto: CreateStockAuditDto, @CurrentUser() user: AuthenticatedUser) {
    // "حفظ واعتماد الجرد" only actually saves-AND-approves in one step for whoever also holds
    // approve rights (Administrator) — resolved from the caller's own JWT permissions, never from
    // the request body, so a client can't ask for approval it isn't entitled to. Anyone without
    // it (e.g. a branch Manager) still just submits CONFIRMED, pending a separate admin approval.
    const autoApprove = user.permissions?.includes('inventory.stockAudit.approve') ?? false;
    return this.service.create(dto, user.userId, user.companyId!, autoApprove);
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
