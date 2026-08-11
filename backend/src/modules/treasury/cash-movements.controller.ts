import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CashMovementsService } from './cash-movements.service';
import { CreateManualCashMovementDto, CreateTransferDto, UpdateManualExpenseDto } from './dto/cash-movement.dto';
import { CashMovementSourceType, CashMovementType } from '../../entities/enums';

@ApiTags('Treasury - Cash Movements')
@Controller('treasury')
export class CashMovementsController {
  constructor(private readonly service: CashMovementsService) {}

  @Post('cash-movements')
  @Permissions('treasury.cash-box.create')
  async create(@Body() dto: CreateManualCashMovementDto, @CurrentUser() user: AuthenticatedUser) {
    if (dto.type === CashMovementType.EXPENSE) {
      await this.service.assertSufficientBalance(user.companyId!, dto.account, dto.amount, dto.branchId ?? null);
    }
    return this.service.record(
      {
        companyId: user.companyId!,
        branchId: dto.branchId ?? null,
        movementDate: dto.movementDate,
        type: dto.type,
        account: dto.account,
        amount: dto.amount,
        sourceType: CashMovementSourceType.MANUAL,
        category: dto.category,
        description: dto.description,
        createdById: user.userId,
      },
    );
  }

  @Post('cash-movements/transfer')
  @Permissions('treasury.cash-box.create')
  transfer(@Body() dto: CreateTransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.createTransfer(
      user.companyId!,
      {
        movementDate: dto.movementDate,
        fromAccount: dto.fromAccount,
        toAccount: dto.toAccount,
        amount: dto.amount,
        description: dto.description,
        branchId: dto.branchId ?? null,
        fromSalesRepresentativeId: dto.fromSalesRepresentativeId ?? null,
      },
      user.userId,
    );
  }

  @Get('rep-treasury-balances')
  @Permissions('treasury.cash-box.view')
  getRepTreasuryBalances(@CurrentUser('companyId') companyId: string) {
    return this.service.getRepTreasuryBalances(companyId);
  }

  @Get('expenses')
  @Permissions('treasury.expense.view')
  expenseTransactions(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getExpenseTransactions(companyId, dateFrom, dateTo, CashMovementSourceType.MANUAL);
  }

  @Get('salaries')
  @Permissions('treasury.expense.view')
  salaryTransactions(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getExpenseTransactions(companyId, dateFrom, dateTo, CashMovementSourceType.PAYROLL);
  }

  @Get('manager-partner-profits')
  @Permissions('treasury.expense.view')
  managerPartnerProfitTransactions(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getManagerPartnerProfitTransactions(companyId, dateFrom, dateTo);
  }

  @Patch('expenses/:id')
  @Permissions('treasury.expense.edit')
  updateExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateManualExpenseDto,
  ) {
    return this.service.updateManualExpense(companyId, id, { ...dto, branchId: dto.branchId ?? null });
  }

  @Delete('expenses/:id')
  @Permissions('treasury.expense.delete')
  deleteExpense(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.deleteManualExpense(companyId, id);
  }

  @Get('reports/expenses')
  @Permissions('accounting.reports.view')
  expenseReport(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getExpenseReport(companyId, dateFrom, dateTo, branchId);
  }

  @Get('reports/cogs-transactions')
  @Permissions('treasury.expense.view')
  cogsTransactions(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getCogsTransactions(companyId, dateFrom, dateTo);
  }

  @Get('reports/profit')
  @Permissions('accounting.reports.view')
  profitReport(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getProfitReport(companyId, dateFrom, dateTo, branchId);
  }

  @Get('reports/printing-performance-trend')
  @Permissions('accounting.reports.view')
  printingPerformanceTrend(
    @CurrentUser('companyId') companyId: string,
    @Query('year') year: string,
    @Query('quarter') quarter: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.getPrintingPerformanceTrend(companyId, Number(year), Number(quarter), branchId);
  }
}
