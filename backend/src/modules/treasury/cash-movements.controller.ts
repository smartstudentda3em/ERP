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
    // Printing Press explicitly picks a branch on this form (required there); every other company
    // has no branch picker at all, so this falls back to the creating user's own branch instead of
    // going in as unattributed (null) — otherwise a company's own branch filter on the Expenses
    // screen would never match any of its expenses. This is attribution ONLY (which branch the
    // stored row reports under) — it must never feed the balance check below.
    const branchId = dto.branchId ?? user.branchId ?? null;
    // Deliberately NOT `branchId` above — that falls back to the user's JWT-cached "main branch"
    // for every non-Press company, which would silently scope the balance check to one branch's
    // cash movements instead of the company-wide total the Dashboard/Purchasing screens show,
    // producing a confusing/wrong "insufficient balance" figure. `dto.branchId ?? undefined`
    // matches PurchaseReceiptsService's own assertSufficientBalance call: company-wide unless
    // Printing Press explicitly picked a branch on this form.
    if (dto.type === CashMovementType.EXPENSE) {
      await this.service.assertSufficientBalance(user.companyId!, dto.account, dto.amount, dto.branchId ?? undefined);
    }
    return this.service.record(
      {
        companyId: user.companyId!,
        branchId,
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

  @Get('rep-treasury-breakdown')
  @Permissions('treasury.cash-box.view')
  getRepTreasuryBreakdown(
    @CurrentUser('companyId') companyId: string,
    @Query('salesRepresentativeId') salesRepresentativeId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getRepTreasuryBreakdown(companyId, salesRepresentativeId, dateFrom, dateTo);
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
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateManualExpenseDto,
  ) {
    // Same fallback as create() — every company except Printing Press has no branch picker on this
    // form, so an edit re-attributes to the editing user's own branch instead of wiping it to null.
    // balanceCheckBranchId is kept separate (the RAW, unresolved dto.branchId) so the balance
    // check itself stays company-wide for non-Press companies — see create()'s own comment on why
    // reusing the attribution branchId there produces a wrong/confusing balance figure.
    return this.service.updateManualExpense(user.companyId!, id, {
      ...dto,
      branchId: dto.branchId ?? user.branchId ?? null,
      balanceCheckBranchId: dto.branchId ?? undefined,
    });
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
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('branchId') branchId?: string,
    @Query('scope') scope?: 'AC' | 'STAT' | 'ALL',
  ) {
    return this.service.getProfitReportScoped(user, dateFrom, dateTo, branchId, scope);
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
