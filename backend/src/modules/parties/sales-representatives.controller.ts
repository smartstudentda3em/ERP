import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { SalesRepresentative } from './entities/sales-representative.entity';
import { Company } from '../settings/entities/company.entity';
import { NumberingSeriesService } from '../settings/numbering-series.controller';
import { quarterDateRange } from '../treasury/partners-treasury.controller';

/** Mirrors frontend/src/lib/use-active-company.ts's PRINTING_PRESS_COMPANY_CODE. */
const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

@Injectable()
export class SalesRepresentativesService extends CompanyScopedCrudService<SalesRepresentative> {
  constructor(
    @InjectRepository(SalesRepresentative) repo: Repository<SalesRepresentative>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {
    super(repo);
  }

  /** Overrides the base class's bare findAll so the list screen can show each rep's branch name
   * (e.g. "حمدي" → "فرع خيطان") without a separate lookup per row. */
  findAllForCompany(companyId: string): Promise<SalesRepresentative[]> {
    return this.repo.find({ where: { companyId }, relations: ['branch'], order: { createdAt: 'ASC' } });
  }

  /** The Printing Press branch (مدير الفرع) is meaningless without a branch — every other
   * company keeps the field optional, matching the legacy free-text territory field it replaced. */
  private async assertBranchRequiredForPress(companyId: string, branchId?: string | null): Promise<void> {
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    if (company?.code === PRINTING_PRESS_COMPANY_CODE && !branchId) {
      throw new BadRequestException('يجب تحديد الفرع');
    }
  }

  async createForCompany(companyId: string, dto: Partial<SalesRepresentative>): Promise<SalesRepresentative> {
    await this.assertBranchRequiredForPress(companyId, dto.branchId);
    const code =
      dto.code || (await this.numberingSeriesService.tryGetNextNumber(companyId, 'SALES_REPRESENTATIVE')) || `REP-${Date.now()}`;
    return super.createForCompany(companyId, { ...dto, code });
  }

  async updateForCompany(
    id: string,
    companyId: string,
    dto: Partial<SalesRepresentative>,
  ): Promise<SalesRepresentative> {
    const existing = await this.findOneForCompany(id, companyId);
    const branchId = dto.branchId !== undefined ? dto.branchId : existing.branchId;
    await this.assertBranchRequiredForPress(companyId, branchId);
    return super.updateForCompany(id, companyId, dto);
  }

  /**
   * Per-representative sales volume (invoices, by invoice date) and collected amount (receipts,
   * by payment date) over a date range — backs the two charts on the "تقارير المناديب" tab. A
   * receipt is attributed to whichever rep is actually known for it: the payment's own
   * salesRepresentativeId if the cashier picked one, else the linked invoice's rep, else the
   * customer's assigned rep — so a receipt collected against an invoice still counts toward that
   * invoice's rep even when the receipt form itself was left blank.
   */
  async getReportsSummary(
    companyId: string,
    dateFrom: string,
    dateTo: string,
    representativeId?: string,
  ): Promise<{ representativeId: string; representativeName: string; salesVolume: number; collectedAmount: number }[]> {
    const reps = await this.repo.find({
      where: { companyId, ...(representativeId ? { id: representativeId } : {}) } as any,
      order: { name: 'ASC' } as any,
    });
    if (reps.length === 0) return [];

    const [salesRows, collectedRows] = await Promise.all([
      this.dataSource
        .createQueryBuilder()
        .select('i."salesRepresentativeId"', 'repId')
        .addSelect('COALESCE(SUM(i."grandTotal"), 0)', 'total')
        .from('sales_invoices', 'i')
        .where('i."companyId" = :companyId', { companyId })
        .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo })
        .andWhere('i."salesRepresentativeId" IS NOT NULL')
        .groupBy('i."salesRepresentativeId"')
        .getRawMany(),
      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(p."salesRepresentativeId", i."salesRepresentativeId", c."salesRepresentativeId")', 'repId')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .from('sales_payments', 'p')
        .leftJoin('sales_invoices', 'i', 'i.id = p."invoiceId"')
        .leftJoin('customers', 'c', 'c.id = p."customerId"')
        .where('p."companyId" = :companyId', { companyId })
        .andWhere('p."paymentDate" >= :dateFrom AND p."paymentDate" <= :dateTo', { dateFrom, dateTo })
        .groupBy('COALESCE(p."salesRepresentativeId", i."salesRepresentativeId", c."salesRepresentativeId")')
        .getRawMany(),
    ]);

    const salesByRepId = new Map(salesRows.map((r) => [r.repId, Number(r.total)]));
    const collectedByRepId = new Map(collectedRows.filter((r) => r.repId).map((r) => [r.repId, Number(r.total)]));

    return reps.map((r) => ({
      representativeId: r.id,
      representativeName: r.name,
      salesVolume: salesByRepId.get(r.id) ?? 0,
      collectedAmount: collectedByRepId.get(r.id) ?? 0,
    }));
  }

  private async getPeriodTotals(companyId: string, dateFrom: string, dateTo: string, representativeId?: string) {
    const salesQb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(i."grandTotal"), 0)', 'total')
      .from('sales_invoices', 'i')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo });
    if (representativeId) salesQb.andWhere('i."salesRepresentativeId" = :representativeId', { representativeId });
    else salesQb.andWhere('i."salesRepresentativeId" IS NOT NULL');

    const collectedQb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .from('sales_payments', 'p')
      .leftJoin('sales_invoices', 'i', 'i.id = p."invoiceId"')
      .leftJoin('customers', 'c', 'c.id = p."customerId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere('p."paymentDate" >= :dateFrom AND p."paymentDate" <= :dateTo', { dateFrom, dateTo });
    if (representativeId) {
      collectedQb.andWhere(
        'COALESCE(p."salesRepresentativeId", i."salesRepresentativeId", c."salesRepresentativeId") = :representativeId',
        { representativeId },
      );
    }

    const [salesRow, collectedRow] = await Promise.all([salesQb.getRawOne(), collectedQb.getRawOne()]);
    return { salesVolume: Number(salesRow?.total ?? 0), collectedAmount: Number(collectedRow?.total ?? 0) };
  }

/** The year the company actually started operating, for the quarterly/YoY chart below — the
   * earlier of its first-ever sales invoice and its own createdAt (covers a company that exists
   * but genuinely has no invoices yet). Company-wide rather than per-manager: "when did the press
   * start operating" doesn't change depending on which manager is selected in the filter above. */
  private async getEarliestActivityYear(companyId: string): Promise<number> {
    const earliestInvoiceRow = await this.dataSource
      .createQueryBuilder()
      .select('MIN(i."invoiceDate")', 'minDate')
      .from('sales_invoices', 'i')
      .where('i."companyId" = :companyId', { companyId })
      .getRawOne();
    if (earliestInvoiceRow?.minDate) return new Date(earliestInvoiceRow.minDate).getFullYear();

    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    return company?.createdAt ? new Date(company.createdAt).getFullYear() : new Date().getFullYear();
  }

  /**
   * Backs the Printing Press-only quarterly/YoY comparison chart on the "تقارير مدراء الفروع"
   * tab: for the selected (year, quarter), returns one totals row per period covering — same-year
   * quarters 1..selected (the within-year trend), the same quarter in the two prior years
   * (year-over-year comparison), and the immediately-preceding quarter (Q(n-1) same year, or Q4 of
   * year-1 when n=1) so the screen's "% change vs previous quarter" indicator always has a value
   * even when that quarter falls outside the chart's own x-axis range. Every period is queried
   * independently via getPeriodTotals — reuses the exact same sales/collected aggregation
   * getReportsSummary already uses, just without the per-representative groupBy.
   *
   * `earliestYear` is also returned so the frontend never draws a comparison year (or a legend
   * entry for it) that predates the company's actual first activity — no fabricated "2024"/"2025"
   * bars for a press that only started operating in 2026.
   */
  async getQuarterlyTrend(
    companyId: string,
    year: number,
    quarter: number,
    representativeId?: string,
  ): Promise<{ periods: { year: number; quarter: number; salesVolume: number; collectedAmount: number }[]; earliestYear: number }> {
    if (quarter < 1 || quarter > 4) return { periods: [], earliestYear: year };

    const earliestYear = await this.getEarliestActivityYear(companyId);

    const periods: { year: number; quarter: number }[] = [];
    const addPeriod = (y: number, q: number) => {
      if (y < earliestYear) return;
      if (!periods.some((p) => p.year === y && p.quarter === q)) periods.push({ year: y, quarter: q });
    };
    for (let q = 1; q <= quarter; q++) addPeriod(year, q);
    addPeriod(year - 1, quarter);
    addPeriod(year - 2, quarter);
    addPeriod(quarter > 1 ? year : year - 1, quarter > 1 ? quarter - 1 : 4);

    const results = await Promise.all(
      periods.map(async (p) => {
        const { dateFrom, dateTo } = quarterDateRange(p.year, p.quarter);
        const totals = await this.getPeriodTotals(companyId, dateFrom, dateTo, representativeId);
        return { year: p.year, quarter: p.quarter, ...totals };
      }),
    );
    return { periods: results, earliestYear };
  }

  /**
   * Backs the Printing Press-only "مقارنة المبيعات" / "مقارنة الأرباح ومعدل الربحية" comparison
   * section on the "تقارير مدراء الفروع" tab — one row per manager (sales representative) for the
   * given period, with both their sales volume and their net profit/margin.
   *
   * Revenue is the same per-representative sales_invoices sum getReportsSummary already computes.
   * Cost, however, isn't something a sales_invoice row carries per rep for Printing Press (its
   * invoices never touch stock, so costOfGoodsSold is always 0 there — see
   * CashMovementsService.getRawMaterialPurchasesTotal) — instead each manager's real cost is
   * whatever their own branch spent in the period: raw material purchases (PurchaseReceipt.branchId)
   * plus operating expenses (CashMovement.branchId), both grouped by branch in one query each and
   * then looked up via the manager's own branchId. Every other company has no branch-scoped
   * purchases/expenses to attribute this way, so it falls back to the invoice's own
   * costOfGoodsSold sum (identical to getProfitReport's non-Press COGS source) with no operating
   * expenses attributed (there's no branch signal to attribute them by).
   */
  async getManagersProfitability(
    companyId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<
    { representativeId: string; representativeName: string; branchName: string | null; salesVolume: number; netProfit: number; profitMargin: number }[]
  > {
    const reps = await this.repo.find({ where: { companyId }, relations: ['branch'] });
    if (reps.length === 0) return [];

    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    const isPress = company?.code === PRINTING_PRESS_COMPANY_CODE;

    const [salesRows, branchCogsRows, branchExpenseRows] = await Promise.all([
      this.dataSource
        .createQueryBuilder()
        .select('i."salesRepresentativeId"', 'repId')
        .addSelect('COALESCE(SUM(i."grandTotal"), 0)', 'revenue')
        .addSelect('COALESCE(SUM(i."costOfGoodsSold"), 0)', 'cogs')
        .from('sales_invoices', 'i')
        .where('i."companyId" = :companyId', { companyId })
        .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo })
        .andWhere('i."salesRepresentativeId" IS NOT NULL')
        .groupBy('i."salesRepresentativeId"')
        .getRawMany(),
      isPress
        ? this.dataSource
            .createQueryBuilder()
            .select('r."branchId"', 'branchId')
            .addSelect('COALESCE(SUM(r."totalAmount"), 0)', 'total')
            .from('purchase_receipts', 'r')
            .where('r."companyId" = :companyId', { companyId })
            .andWhere('r."receiptDate" >= :dateFrom AND r."receiptDate" <= :dateTo', { dateFrom, dateTo })
            .andWhere('r."branchId" IS NOT NULL')
            .groupBy('r."branchId"')
            .getRawMany()
        : [],
      this.dataSource
        .createQueryBuilder()
        .select('m."branchId"', 'branchId')
        .addSelect('COALESCE(SUM(m.amount), 0)', 'total')
        .from('cash_movements', 'm')
        .where('m."companyId" = :companyId', { companyId })
        .andWhere('m.type = :type', { type: 'EXPENSE' })
        .andWhere('m."sourceType" = :sourceType', { sourceType: 'MANUAL' })
        .andWhere('m."movementDate" >= :dateFrom AND m."movementDate" <= :dateTo', { dateFrom, dateTo })
        .andWhere('m."branchId" IS NOT NULL')
        .groupBy('m."branchId"')
        .getRawMany(),
    ]);

    const revenueByRepId = new Map(salesRows.map((r) => [r.repId, Number(r.revenue)]));
    const invoiceCogsByRepId = new Map(salesRows.map((r) => [r.repId, Number(r.cogs)]));
    const cogsByBranchId = new Map(branchCogsRows.map((r: any) => [r.branchId, Number(r.total)]));
    const expensesByBranchId = new Map(branchExpenseRows.map((r: any) => [r.branchId, Number(r.total)]));

    return reps.map((r) => {
      const revenue = revenueByRepId.get(r.id) ?? 0;
      const cogs = isPress ? (r.branchId ? cogsByBranchId.get(r.branchId) ?? 0 : 0) : invoiceCogsByRepId.get(r.id) ?? 0;
      const operatingExpenses = isPress && r.branchId ? expensesByBranchId.get(r.branchId) ?? 0 : 0;
      const netProfit = revenue - cogs - operatingExpenses;
      return {
        representativeId: r.id,
        representativeName: r.name,
        branchName: (r as any).branch?.nameAr || (r as any).branch?.nameEn || null,
        salesVolume: revenue,
        netProfit,
        profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      };
    });
  }

  /**
   * Branch Managers Commission report: each branch's total sales for the period × its assigned
   * manager's commissionRate — attributed to the branch itself (SalesInvoice.branchId), not
   * whichever employee actually created each invoice, so a manager's commission always reflects
   * everything sold under their branch regardless of who rang it up. One row per branch (even a
   * branch with no assigned manager or no sales in the period still appears, with zeros), so the
   * report never needs a manager picked per invoice — it's derived entirely from the branch.
   */
  async getBranchManagersCommission(
    companyId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<
    {
      branchId: string;
      branchName: string | null;
      managerId: string | null;
      managerName: string | null;
      totalSales: number;
      commissionRate: number;
      commissionAmount: number;
    }[]
  > {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('b.id', 'branchId')
      .addSelect('COALESCE(b."nameAr", b."nameEn")', 'branchName')
      .addSelect('r.id', 'managerId')
      .addSelect('r.name', 'managerName')
      .addSelect('COALESCE(r."commissionRate", 0)', 'commissionRate')
      .addSelect(
        `COALESCE((
          SELECT SUM(i."grandTotal") FROM sales_invoices i
          WHERE i."branchId" = b.id AND i."companyId" = :companyId
            AND i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo
        ), 0)`,
        'totalSales',
      )
      .from('branches', 'b')
      .leftJoin('sales_representatives', 'r', 'r."branchId" = b.id')
      .where('b."companyId" = :companyId', { companyId })
      .setParameters({ companyId, dateFrom, dateTo })
      .orderBy('b."nameAr"', 'ASC')
      .getRawMany();

    return rows
      .map((r) => {
        const totalSales = Number(r.totalSales);
        const commissionRate = Number(r.commissionRate);
        return {
          branchId: r.branchId,
          branchName: r.branchName,
          managerId: r.managerId,
          managerName: r.managerName,
          totalSales,
          commissionRate,
          commissionAmount: (totalSales * commissionRate) / 100,
        };
      })
      .sort((a, b) => b.commissionAmount - a.commissionAmount);
  }

  /** The actual invoices behind the "حجم المبيعات" chart bar(s) — same population (rep IS NOT NULL, or one specific rep) and date range as getReportsSummary, so the table always reconciles with the chart. */
  async getReportsInvoices(companyId: string, dateFrom: string, dateTo: string, representativeId?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('i.id', 'id')
      .addSelect('i."documentNumber"', 'documentNumber')
      .addSelect('i."invoiceDate"', 'invoiceDate')
      .addSelect('i."grandTotal"', 'grandTotal')
      .addSelect('i.status', 'status')
      .addSelect('c.name', 'customerName')
      .from('sales_invoices', 'i')
      .innerJoin('customers', 'c', 'c.id = i."customerId"')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo });
    if (representativeId) qb.andWhere('i."salesRepresentativeId" = :representativeId', { representativeId });
    else qb.andWhere('i."salesRepresentativeId" IS NOT NULL');

    const rows = await qb.orderBy('i."invoiceDate"', 'DESC').addOrderBy('i."documentNumber"', 'DESC').getRawMany();
    return rows.map((r) => ({ ...r, grandTotal: Number(r.grandTotal) }));
  }

  /** The actual receipts behind the "تحصيل الأرصدة المستحقة" chart bar(s) — attributed with the exact same fallback chain (own rep, else invoice's rep, else customer's rep) getReportsSummary uses, so the table always reconciles with the chart. */
  async getReportsReceipts(companyId: string, dateFrom: string, dateTo: string, representativeId?: string) {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('p.id', 'id')
      .addSelect('p."documentNumber"', 'documentNumber')
      .addSelect('p."paymentDate"', 'paymentDate')
      .addSelect('p.amount', 'amount')
      .addSelect('p.method', 'method')
      .addSelect('c.name', 'customerName')
      .addSelect(
        'COALESCE(p."salesRepresentativeId", i."salesRepresentativeId", c."salesRepresentativeId")',
        'attributedRepId',
      )
      .from('sales_payments', 'p')
      .leftJoin('sales_invoices', 'i', 'i.id = p."invoiceId"')
      .innerJoin('customers', 'c', 'c.id = p."customerId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere('p."paymentDate" >= :dateFrom AND p."paymentDate" <= :dateTo', { dateFrom, dateTo })
      .orderBy('p."paymentDate"', 'DESC')
      .addOrderBy('p."documentNumber"', 'DESC')
      .getRawMany();

    return rows
      .filter((r) => (representativeId ? r.attributedRepId === representativeId : !!r.attributedRepId))
      .map(({ attributedRepId, ...r }) => ({ ...r, amount: Number(r.amount) }));
  }
}

@ApiTags('Sales Representatives')
@Controller('sales-representatives')
export class SalesRepresentativesController {
  constructor(private readonly service: SalesRepresentativesService) {}

  @Get() @Permissions('sales-representatives.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Get('reports/summary')
  @Permissions('sales-representatives.view')
  reportsSummary(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('representativeId') representativeId?: string,
  ) {
    return this.service.getReportsSummary(companyId, dateFrom, dateTo, representativeId);
  }
  @Get('reports/quarterly-trend')
  @Permissions('sales-representatives.view')
  reportsQuarterlyTrend(
    @CurrentUser('companyId') companyId: string,
    @Query('year') year: string,
    @Query('quarter') quarter: string,
    @Query('representativeId') representativeId?: string,
  ) {
    return this.service.getQuarterlyTrend(companyId, Number(year), Number(quarter), representativeId);
  }
  @Get('reports/profitability')
  @Permissions('sales-representatives.view')
  reportsProfitability(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.service.getManagersProfitability(companyId, dateFrom, dateTo);
  }
  @Get('reports/branch-commissions')
  @Permissions('sales-representatives.view')
  reportsBranchCommissions(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.service.getBranchManagersCommission(companyId, dateFrom, dateTo);
  }
  @Get('reports/invoices')
  @Permissions('sales-representatives.view')
  reportsInvoices(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('representativeId') representativeId?: string,
  ) {
    return this.service.getReportsInvoices(companyId, dateFrom, dateTo, representativeId);
  }
  @Get('reports/receipts')
  @Permissions('sales-representatives.view')
  reportsReceipts(
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Query('representativeId') representativeId?: string,
  ) {
    return this.service.getReportsReceipts(companyId, dateFrom, dateTo, representativeId);
  }
  @Get(':id') @Permissions('sales-representatives.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('sales-representatives.create') create(
    @Body() dto: Partial<SalesRepresentative>,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('sales-representatives.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<SalesRepresentative>,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('sales-representatives.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
