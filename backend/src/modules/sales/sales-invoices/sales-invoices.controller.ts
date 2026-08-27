import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { SalesInvoicesService } from './sales-invoices.service';
import { CreateSalesInvoiceDto, UpdateSalesInvoiceDto } from './dto/sales-invoice.dto';

@ApiTags('Sales - Invoices')
@Controller('sales/invoices')
export class SalesInvoicesController {
  constructor(private readonly service: SalesInvoicesService) {}

  @Get()
  @Permissions('sales.invoice.view')
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    // Branch/own-invoice scoping and the "مدير فرع" zero-commission filter are both resolved inside
    // the service itself now (re-derived from the DB via SalesRepAccessService), not inferred here
    // from JWT permission codes — see SalesInvoicesService.findAll()'s own doc comment. branchId is
    // an optional request from the caller (currently only sent by Air Conditioning's list-view
    // filter — see SalesInvoicesPage.tsx) — resolveBranchId() re-pins/ignores it for a non-admin
    // regardless of what's passed, exactly like the sibling report/lines route below already does.
    return this.service.findAll(user.companyId!, user.userId, branchId);
  }

  /** Lightweight active-user list for the "attributed to" field — gated by sales.invoice.create rather than users.view, so a salesperson without user-management access can still attribute their own invoices. */
  @Get('assignable-users')
  @Permissions('sales.invoice.create')
  getAssignableUsers(@CurrentUser('companyId') companyId: string) {
    return this.service.getAssignableUsers(companyId);
  }

  @Get('report/lines')
  @Permissions('sales.invoice.view')
  getSalesLines(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getSalesLines(user.companyId!, user.userId, dateFrom, dateTo, branchId);
  }

  @Get(':id')
  @Permissions('sales.invoice.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('sales.invoice.create')
  create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!, user.permissions);
  }

  @Patch(':id')
  @Permissions('sales.invoice.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalesInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.userId, user.companyId!);
  }

  @Delete(':id')
  @Permissions('sales.invoice.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.userId, user.companyId!);
  }
}
