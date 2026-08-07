import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CashMovementsService } from './cash-movements.service';
import {
  CreateCapitalInjectionDto,
  CreateCommissionPayoutDto,
  CreateDividendDto,
  UpdateCapitalInjectionDto,
  UpdateCommissionPayoutDto,
} from './dto/partners-treasury.dto';
import { CashMovementAccount, CashMovementSourceType, CashMovementType } from '../../entities/enums';
import { Partner } from '../settings/entities/partner.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { Company } from '../settings/entities/company.entity';
import { SalesRepresentative } from '../parties/entities/sales-representative.entity';

/** Mirrors frontend/src/lib/use-active-company.ts's PRINTING_PRESS_COMPANY_CODE. */
const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

/** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31. `quarter` 0 means the full year (Jan1–Dec31). */
export function quarterDateRange(year: number, quarter: number): { dateFrom: string; dateTo: string } {
  if (quarter === 0) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    dateFrom: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

@ApiTags('Treasury - Partners')
@Controller('treasury')
export class PartnersTreasuryController {
  constructor(
    private readonly cashMovementsService: CashMovementsService,
    @InjectRepository(Partner) private readonly partnerRepo: Repository<Partner>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(SalesRepresentative) private readonly salesRepresentativeRepo: Repository<SalesRepresentative>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Post('capital-injections')
  @Permissions('partners.create')
  async createCapitalInjection(@Body() dto: CreateCapitalInjectionDto, @CurrentUser() user: AuthenticatedUser) {
    const companyId = user.companyId!;
    const partner = await this.partnerRepo.findOne({ where: { id: dto.partnerId, companyId, isActive: true } });
    if (!partner) {
      throw new BadRequestException('Selected partner was not found or is not active');
    }

    // Printing Press: the user explicitly picks which real account the money actually lands in
    // (CASH or BANK) — a single row covers both the treasury liquidity effect and the partner's
    // equity attribution, no linked memo row needed.
    if (dto.account) {
      const company = await this.companiesRepo.findOne({ where: { id: companyId } });
      if (company?.code === PRINTING_PRESS_COMPANY_CODE) {
        // The partner's own branchId (when set) is authoritative — a branch-bound partner's
        // contribution can only ever be attributed to their own branch, same rule as a dividend.
        return this.cashMovementsService.record({
          companyId,
          branchId: partner.branchId ?? dto.branchId ?? null,
          movementDate: dto.movementDate,
          type: CashMovementType.INCOME,
          account: dto.account,
          amount: dto.amount,
          sourceType: CashMovementSourceType.CAPITAL_INJECTION,
          category: 'Capital Injection',
          partnerId: dto.partnerId,
          description: dto.description,
          createdById: user.userId,
        });
      }
    }

    // A contribution is real money ONE partner puts in from their own pocket — never split across
    // the others by ownership share the way a dividend payout is, since they didn't pay any of it.
    // It lands in TWO places at once, in one transaction: the actual treasury liquidity (CASH,
    // unattributed) and that one partner's equity row (BANK, partnerId) for the FULL amount — the
    // CASH row is linked back via sourceId so editing/deleting the visible contribution keeps both
    // in sync.
    return this.dataSource.transaction(async (manager) => {
      const cashMovement = await this.cashMovementsService.record(
        {
          companyId,
          movementDate: dto.movementDate,
          type: CashMovementType.INCOME,
          account: CashMovementAccount.CASH,
          amount: dto.amount,
          sourceType: CashMovementSourceType.CAPITAL_INJECTION,
          category: 'Capital Injection',
          description: dto.description,
          createdById: user.userId,
        },
        manager,
      );
      return this.cashMovementsService.record(
        {
          companyId,
          movementDate: dto.movementDate,
          type: CashMovementType.INCOME,
          account: CashMovementAccount.BANK,
          amount: dto.amount,
          sourceType: CashMovementSourceType.CAPITAL_INJECTION,
          sourceId: cashMovement.id,
          category: 'Capital Injection',
          partnerId: dto.partnerId,
          description: dto.description,
          createdById: user.userId,
        },
        manager,
      );
    });
  }

  /** Only the partner-attributed (BANK) side of each injection — the linked CASH row is an internal bookkeeping mirror, not a separate visible contribution. Optionally scoped to one partner. */
  @Get('capital-injections')
  @Permissions('partners.view')
  getCapitalInjections(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    return this.cashMovementsService.getCapitalInjections(companyId, dateFrom, dateTo, partnerId);
  }

  @Patch('capital-injections/:id')
  @Permissions('partners.edit')
  updateCapitalInjection(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateCapitalInjectionDto,
  ) {
    return this.cashMovementsService.updateCapitalInjection(companyId, id, dto);
  }

  @Delete('capital-injections/:id')
  @Permissions('partners.delete')
  deleteCapitalInjection(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.cashMovementsService.deleteCapitalInjection(companyId, id);
  }

  /**
   * Each active partner's running balance — the sum of THIS partner's own capital injections only
   * (never dividends: a payout received is not a contribution paid in, so it must never inflate
   * this number). `total` is derived by summing these same per-partner balances, so the top
   * "Total Contribution Balance" card and this table can never disagree with each other or with
   * the Contribution History log below them — all three read the exact same filtered rows.
   */
  @Get('partners-balances')
  @Permissions('partners.view')
  async getPartnersBalances(@CurrentUser('companyId') companyId: string, @Query('branchId') branchId?: string) {
    // Printing Press only — a partner's own `branchId` now scopes which cap table they belong to,
    // so narrowing by branch here also narrows WHICH partners show up at all, not just their
    // movement totals (a partner recorded against another branch was never eligible for this
    // branch's dividends/injections in the first place).
    const partners = await this.partnerRepo.find({
      where: { companyId, isActive: true, ...(branchId ? { branchId } : {}) },
      order: { createdAt: 'ASC' },
    });
    const rowsQb = this.dataSource
      .createQueryBuilder()
      .select('m."partnerId"', 'partnerId')
      .addSelect('COALESCE(SUM(m.amount), 0)', 'total')
      .from('cash_movements', 'm')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere('m."partnerId" IS NOT NULL')
      .andWhere('m."sourceType" = :sourceType', { sourceType: CashMovementSourceType.CAPITAL_INJECTION })
      .groupBy('m."partnerId"');
    // Printing Press only — the Dashboard's Branch filter narrows "إجمالي المساهمات" to
    // contributions recorded against one branch (see createCapitalInjection's Press single-row path).
    if (branchId) rowsQb.andWhere('m."branchId" = :branchId', { branchId });
    const rows = await rowsQb.getRawMany();
    const balanceByPartnerId = new Map(rows.map((r) => [r.partnerId, Number(r.total)]));
    const balances = partners.map((p) => ({
      partnerId: p.id,
      name: p.name,
      sharePercentage: Number(p.sharePercentage),
      branchId: p.branchId,
      balance: balanceByPartnerId.get(p.id) ?? 0,
    }));
    return {
      balances,
      total: balances.reduce((sum, b) => sum + b.balance, 0),
    };
  }

  /**
   * How much MORE a specific partner can still be paid out this quarter — their share of the
   * quarter's available profit, minus whatever's already been paid to them (not to the other
   * partners) within the same period. Backs the dividend modal's read-only "الحد الأقصى المتاح
   * للصرف" field and the amount field's client-side validation, both of which read this same
   * number so they can never disagree.
   */
  @Get('dividends/partner-max')
  @Permissions('partners.view')
  async getPartnerMaxDividend(
    @CurrentUser('companyId') companyId: string,
    @Query('year') year: string,
    @Query('quarter') quarter: string,
    @Query('partnerId') partnerId: string,
  ) {
    const partner = await this.partnerRepo.findOne({ where: { id: partnerId, companyId, isActive: true } });
    if (!partner) throw new BadRequestException('Selected partner was not found or is not active');

    // Printing Press only — a branch-owned partner's available pool and distributed history are
    // scoped to their own branch's profit and payouts, never mixed with another branch's, exactly
    // as this partner's own sharePercentage is now already scoped by branchId. Every other
    // company's partners have no branchId, so this stays company-wide for them, unchanged.
    const branchId = partner.branchId ?? undefined;
    const { dateFrom, dateTo } = quarterDateRange(Number(year), Number(quarter));
    const { netProfit } = await this.cashMovementsService.getProfitReport(companyId, dateFrom, dateTo, branchId);
    const totalAlreadyDistributed = await this.cashMovementsService.getDistributedDividendsTotal(
      companyId,
      dateFrom,
      dateTo,
      undefined,
      branchId,
    );
    const available = netProfit <= 0 ? 0 : Math.max(netProfit - totalAlreadyDistributed, 0);
    const alreadyPaidToPartner = await this.cashMovementsService.getDistributedDividendsTotal(
      companyId,
      dateFrom,
      dateTo,
      partnerId,
      branchId,
    );
    const sharePercentage = Number(partner.sharePercentage);
    const maxAmount = Math.max((sharePercentage / 100) * available - alreadyPaidToPartner, 0);

    return { sharePercentage, available, alreadyPaidToPartner, maxAmount };
  }

  @Post('dividends')
  @Permissions('partners.create')
  async createDividend(@Body() dto: CreateDividendDto, @CurrentUser() user: AuthenticatedUser) {
    const companyId = user.companyId!;
    const partner = await this.partnerRepo.findOne({ where: { id: dto.partnerId, companyId, isActive: true } });
    if (!partner) throw new BadRequestException('Selected partner was not found or is not active');

    // Printing Press only — see getPartnerMaxDividend's comment: a branch-owned partner's payout
    // is capped by their own branch's profit/distribution history, never another branch's.
    const branchId = partner.branchId ?? undefined;
    const { dateFrom, dateTo } = quarterDateRange(dto.year, dto.quarter);
    const { netProfit } = await this.cashMovementsService.getProfitReport(companyId, dateFrom, dateTo, branchId);
    const totalAlreadyDistributed = await this.cashMovementsService.getDistributedDividendsTotal(
      companyId,
      dateFrom,
      dateTo,
      undefined,
      branchId,
    );
    const available = netProfit <= 0 ? 0 : Math.max(netProfit - totalAlreadyDistributed, 0);
    const alreadyPaidToPartner = await this.cashMovementsService.getDistributedDividendsTotal(
      companyId,
      dateFrom,
      dateTo,
      dto.partnerId,
      branchId,
    );
    const maxAmount = Math.max((Number(partner.sharePercentage) / 100) * available - alreadyPaidToPartner, 0);
    if (dto.amount > maxAmount) {
      throw new BadRequestException(
        `Cannot distribute ${dto.amount.toFixed(2)} to ${partner.name} — only ${maxAmount.toFixed(2)} of their share remains available this period (share ${Number(partner.sharePercentage).toFixed(2)}%, already paid ${alreadyPaidToPartner.toFixed(2)}).`,
      );
    }

    // A dividend is real cash actually paid out to ONE partner, so it draws down the Bank Balance
    // (CASH) — the same account real income/expenses move through — not the Partners' Balance
    // (BANK) memo account capital injections track into. Never split across the other partners:
    // each of them draws down their own share independently, whenever they choose to. The
    // partner's own branchId (when set) is authoritative over whatever branch the client sent —
    // a branch-bound partner's payout can only ever be attributed to their own branch.
    return this.cashMovementsService.record({
      companyId,
      branchId: partner.branchId ?? dto.branchId ?? null,
      movementDate: dto.movementDate,
      type: CashMovementType.EXPENSE,
      account: CashMovementAccount.CASH,
      amount: dto.amount,
      sourceType: CashMovementSourceType.DIVIDEND,
      category: 'Dividends',
      partnerId: dto.partnerId,
      description: dto.description,
      createdById: user.userId,
    });
  }

  @Get('dividends')
  @Permissions('partners.view')
  getDividends(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('partnerId') partnerId?: string,
  ) {
    return this.cashMovementsService.getDividendTransactions(companyId, dateFrom, dateTo, partnerId);
  }

  @Get('dividends/available')
  @Permissions('partners.view')
  async getAvailableDividends(
    @CurrentUser('companyId') companyId: string,
    @Query('year') year: string,
    @Query('quarter') quarter: string,
  ) {
    const { dateFrom, dateTo } = quarterDateRange(Number(year), Number(quarter));
    const { netProfit } = await this.cashMovementsService.getProfitReport(companyId, dateFrom, dateTo);
    const alreadyDistributed = await this.cashMovementsService.getDistributedDividendsTotal(
      companyId,
      dateFrom,
      dateTo,
    );
    // Accounting rule: a quarter with zero or negative net profit has nothing available to
    // distribute, regardless of what's already been paid out — never surface a negative amount.
    const available = netProfit <= 0 ? 0 : Math.max(netProfit - alreadyDistributed, 0);
    return {
      dateFrom,
      dateTo,
      netProfit,
      alreadyDistributed,
      available,
    };
  }

  /** "صرف الأرباح" — pays a Printing Press branch manager's earned commission out of the chosen account. */
  @Post('commission-payouts')
  @Permissions('sales-representatives.create')
  async createCommissionPayout(@Body() dto: CreateCommissionPayoutDto, @CurrentUser() user: AuthenticatedUser) {
    const companyId = user.companyId!;
    const rep = await this.salesRepresentativeRepo.findOne({
      where: { id: dto.salesRepresentativeId, companyId, isActive: true },
    });
    if (!rep) throw new BadRequestException('Selected branch manager was not found or is not active');

    return this.cashMovementsService.createCommissionPayout(companyId, {
      movementDate: dto.movementDate,
      amount: dto.amount,
      account: dto.account,
      salesRepresentativeId: dto.salesRepresentativeId,
      branchId: dto.branchId ?? rep.branchId ?? null,
      description: dto.description,
      createdById: user.userId,
    });
  }

  @Get('commission-payouts')
  @Permissions('sales-representatives.view')
  getCommissionPayouts(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('salesRepresentativeId') salesRepresentativeId?: string,
  ) {
    return this.cashMovementsService.getCommissionPayouts(companyId, dateFrom, dateTo, salesRepresentativeId);
  }

  @Patch('commission-payouts/:id')
  @Permissions('sales-representatives.edit')
  updateCommissionPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Body() dto: UpdateCommissionPayoutDto,
  ) {
    return this.cashMovementsService.updateCommissionPayout(companyId, id, dto);
  }

  @Delete('commission-payouts/:id')
  @Permissions('sales-representatives.delete')
  deleteCommissionPayout(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.cashMovementsService.deleteCommissionPayout(companyId, id);
  }
}
