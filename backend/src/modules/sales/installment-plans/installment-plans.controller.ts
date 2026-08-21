import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { InstallmentPlansService } from './installment-plans.service';
import {
  CreateInstallmentPlanDto,
  EarlySettleInstallmentPlanDto,
  RecordInstallmentPaymentDto,
} from './dto/installment-plan.dto';

@ApiTags('Sales - Installment Plans')
@Controller('installments')
export class InstallmentPlansController {
  constructor(private readonly service: InstallmentPlansService) {}

  @Get()
  @Permissions('sales.installmentPlan.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }

  @Get('reports/summary')
  @Permissions('sales.installmentPlan.view')
  getSummary(@CurrentUser('companyId') companyId: string) {
    return this.service.getSummary(companyId);
  }

  @Get('reports/expected-cash-flow')
  @Permissions('sales.installmentPlan.view')
  getExpectedCashFlow(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getExpectedCashFlow(companyId, dateFrom, dateTo);
  }

  @Get('reports/interest-profit')
  @Permissions('sales.installmentPlan.view')
  getInterestProfit(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getInterestProfit(companyId, dateFrom, dateTo);
  }

  @Get(':id')
  @Permissions('sales.installmentPlan.view')
  getScheduleView(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.getScheduleView(id, companyId);
  }

  @Post()
  @Permissions('sales.installmentPlan.create')
  create(@Body() dto: CreateInstallmentPlanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.companyId!, user.userId, user.branchId);
  }

  @Post(':id/schedule/:itemId/payments')
  @Permissions('sales.installmentPlan.edit')
  recordPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: RecordInstallmentPaymentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.recordPayment(id, itemId, dto, user.companyId!, user.userId);
  }

  @Post(':id/settle-early')
  @Permissions('sales.installmentPlan.approve')
  settleEarly(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EarlySettleInstallmentPlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.settleEarly(id, dto, user.companyId!, user.userId);
  }

  @Delete(':id')
  @Permissions('sales.installmentPlan.delete')
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.cancel(id, user.companyId!, user.userId);
  }
}
