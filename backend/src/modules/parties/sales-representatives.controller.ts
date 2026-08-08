import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  NotFoundException,
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
import { CommissionException } from './entities/commission-exception.entity';
import { CreateCommissionExceptionDto } from './dto/commission-exception.dto';
import { Company } from '../settings/entities/company.entity';
import { NumberingSeriesService } from '../settings/numbering-series.controller';
import { quarterDateRange } from '../treasury/partners-treasury.controller';
import { Employee } from '../hr/entities/employee.entity';
import { PayrollRun, PayrollRunLine } from '../hr/entities/payroll-run.entity';

/** Mirrors frontend/src/lib/use-active-company.ts's PRINTING_PRESS_COMPANY_CODE. */
const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

@Injectable()
export class SalesRepresentativesService extends CompanyScopedCrudService<SalesRepresentative> {
  constructor(
    @InjectRepository(SalesRepresentative) repo: Repository<SalesRepresentative>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(CommissionException) private readonly commissionExceptionsRepo: Repository<CommissionException>,
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(PayrollRun) private readonly payrollRunRepo: Repository<PayrollRun>,
    @InjectRepository(PayrollRunLine) private readonly payrollRunLineRepo: Repository<PayrollRunLine>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {
    super(repo);
  }

  /** Exactly one of productId/categoryId must be set on a commission exception — there's no DB
   * constraint for this (this module has no migration workflow), so it's enforced here the same
   * way assertBranchRequiredForPress() enforces its own cross-field rule below. */
  private assertExactlyOneTarget(dto: { productId?: string; categoryId?: string }): void {
    if (!!dto.productId === !!dto.categoryId) {
      throw new BadRequestException('يجب تحديد منتج واحد أو فئة واحدة، وليس كلاهما أو لا شيء');
    }
  }

  async listCommissionExceptions(companyId: string, repId: string): Promise<CommissionException[]> {
    await this.findOneForCompany(repId, companyId);
    return this.commissionExceptionsRepo.find({
      where: { companyId, salesRepresentativeId: repId },
      relations: ['product', 'category'],
      order: { createdAt: 'ASC' },
    });
  }

  async addCommissionException(
    companyId: string,
    repId: string,
    dto: CreateCommissionExceptionDto,
  ): Promise<CommissionException> {
    await this.findOneForCompany(repId, companyId);
    this.assertExactlyOneTarget(dto);
    const exception = this.commissionExceptionsRepo.create({
      companyId,
      salesRepresentativeId: repId,
      productId: dto.productId ?? null,
      categoryId: dto.categoryId ?? null,
      commissionRate: dto.commissionRate,
    });
    return this.commissionExceptionsRepo.save(exception);
  }

  async removeCommissionException(companyId: string, repId: string, exceptionId: string): Promise<void> {
    const exception = await this.commissionExceptionsRepo.findOne({
      where: { id: exceptionId, companyId, salesRepresentativeId: repId },
    });
    if (!exception) throw new NotFoundException('Commission exception not found');
    await this.commissionExceptionsRepo.remove(exception);
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
   *
   * An invoice's own attribution has the same kind of fallback: SalesInvoicesPage's combined
   * "مندوب/مستخدم" dropdown lets an invoice be assigned directly to a system user (createdById)
   * with no linked SalesRepresentative row at all — e.g. a مدير فرع whose SalesRepresentative
   * link was never synced, or an admin who picked "المستخدم" instead of "المندوب" for them. Such
   * an invoice has salesRepresentativeId = NULL, so counting only exact salesRepresentativeId
   * matches silently drops real sales from that manager's totals. r2 resolves the invoice to
   * whichever rep's own userId equals its createdById, but only when salesRepresentativeId itself
   * is NULL — an invoice with an explicit (different) rep is never reattributed.
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
        .select('COALESCE(i."salesRepresentativeId", r2.id)', 'repId')
        .addSelect('COALESCE(SUM(i."grandTotal"), 0)', 'total')
        .from('sales_invoices', 'i')
        .leftJoin(
          'sales_representatives',
          'r2',
          'r2."userId" = i."createdById" AND r2."companyId" = i."companyId" AND i."salesRepresentativeId" IS NULL',
        )
        .where('i."companyId" = :companyId', { companyId })
        .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo })
        .andWhere('(i."salesRepresentativeId" IS NOT NULL OR r2.id IS NOT NULL)')
        .groupBy('COALESCE(i."salesRepresentativeId", r2.id)')
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
    // Same createdById fallback as getReportsSummary — an invoice with no salesRepresentativeId
    // still resolves to whichever rep's own userId equals its createdById.
    const salesQb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(i."grandTotal"), 0)', 'total')
      .from('sales_invoices', 'i')
      .leftJoin(
        'sales_representatives',
        'r2',
        'r2."userId" = i."createdById" AND r2."companyId" = i."companyId" AND i."salesRepresentativeId" IS NULL',
      )
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo });
    if (representativeId) {
      salesQb.andWhere('COALESCE(i."salesRepresentativeId", r2.id) = :representativeId', { representativeId });
    } else {
      salesQb.andWhere('(i."salesRepresentativeId" IS NOT NULL OR r2.id IS NOT NULL)');
    }

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

    // When a specific manager is selected, sales must be resolved the exact same way "لوحة
    // المدير" resolves them (buildManagerDashboardForRep): by that manager's own branchId, not by
    // matching SalesInvoice.salesRepresentativeId / createdById — Printing Press invoices are
    // created via a branch selector, not a rep selector, so most never get salesRepresentativeId
    // set at all, and createdById only matches when the manager's own login happened to create
    // the invoice. That mismatch is exactly what made a manager's dashboard total (branch-scoped)
    // disagree with this chart's total (rep-id-scoped) for the same period. Resolved once here,
    // outside the per-period loop below, since it never changes across periods.
    let repBranchId: string | null = null;
    let generalRate = 0;
    let exceptions = { byProductId: new Map<string, number>(), byCategoryId: new Map<string, number>() };
    if (representativeId) {
      const rep = await this.repo.findOne({ where: { id: representativeId, companyId } as any });
      if (rep) {
        repBranchId = rep.branchId ?? null;
        generalRate = Number(rep.commissionRate ?? 0);
        const exceptionRows = await this.commissionExceptionsRepo.find({
          where: { companyId, salesRepresentativeId: representativeId },
        });
        for (const e of exceptionRows) {
          if (e.productId) exceptions.byProductId.set(e.productId, Number(e.commissionRate));
          else if (e.categoryId) exceptions.byCategoryId.set(e.categoryId, Number(e.commissionRate));
        }
      }
    }

    const results = await Promise.all(
      periods.map(async (p) => {
        const { dateFrom, dateTo } = quarterDateRange(p.year, p.quarter);
        if (representativeId && repBranchId) {
          const [salesVolume, { collectedAmount }] = await Promise.all([
            this.getManagerBranchSalesForPeriod(companyId, repBranchId, dateFrom, dateTo, generalRate, exceptions),
            this.getPeriodTotals(companyId, dateFrom, dateTo, representativeId),
          ]);
          return { year: p.year, quarter: p.quarter, salesVolume, collectedAmount };
        }
        const totals = await this.getPeriodTotals(companyId, dateFrom, dateTo, representativeId);
        return { year: p.year, quarter: p.quarter, ...totals };
      }),
    );
    return { periods: results, earliestYear };
  }

  /** The exact same totalSales computation "لوحة المدير" uses for a manager
   * (buildManagerDashboardForRep below): branch-scoped invoice lines, excluding any line whose
   * resolved commission rate is 0 ("not his sale for commission purposes"). Reused here so the
   * quarterly-trend chart's per-manager sales figure can never drift from what that same manager's
   * own dashboard shows for the same period. */
  private async getManagerBranchSalesForPeriod(
    companyId: string,
    branchId: string,
    dateFrom: string,
    dateTo: string,
    generalRate: number,
    exceptions: { byProductId: Map<string, number>; byCategoryId: Map<string, number> },
  ): Promise<number> {
    const lineRows = await this.dataSource
      .createQueryBuilder()
      .select('l."lineTotal"', 'lineTotal')
      .addSelect('l."productId"', 'productId')
      .addSelect('p."categoryId"', 'categoryId')
      .from('sales_invoice_lines', 'l')
      .innerJoin('sales_invoices', 'i', 'i.id = l."invoiceId"')
      .innerJoin('products', 'p', 'p.id = l."productId"')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."branchId" = :branchId', { branchId })
      .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo })
      .getRawMany();

    let totalSales = 0;
    for (const line of lineRows) {
      const rate = this.resolveLineRate(line, exceptions, generalRate);
      if (rate <= 0) continue;
      totalSales += Number(line.lineTotal);
    }
    return totalSales;
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
      // Same createdById fallback as getReportsSummary — an invoice with no salesRepresentativeId
      // still resolves to whichever rep's own userId equals its createdById.
      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(i."salesRepresentativeId", r2.id)', 'repId')
        .addSelect('COALESCE(SUM(i."grandTotal"), 0)', 'revenue')
        .addSelect('COALESCE(SUM(i."costOfGoodsSold"), 0)', 'cogs')
        .from('sales_invoices', 'i')
        .leftJoin(
          'sales_representatives',
          'r2',
          'r2."userId" = i."createdById" AND r2."companyId" = i."companyId" AND i."salesRepresentativeId" IS NULL',
        )
        .where('i."companyId" = :companyId', { companyId })
        .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo })
        .andWhere('(i."salesRepresentativeId" IS NOT NULL OR r2.id IS NOT NULL)')
        .groupBy('COALESCE(i."salesRepresentativeId", r2.id)')
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

  /** Shared by getBranchManagersCommission() and getManagerDashboard() so the two commission
   * calculations can never silently diverge: a line's rate is its product-specific exception,
   * else its category's exception, else the manager's own general commissionRate. */
  private resolveLineRate(
    line: { productId: string; categoryId: string | null },
    exceptions: { byProductId: Map<string, number>; byCategoryId: Map<string, number> } | undefined,
    generalRate: number,
  ): number {
    return (
      exceptions?.byProductId.get(line.productId) ??
      (line.categoryId ? exceptions?.byCategoryId.get(line.categoryId) : undefined) ??
      generalRate
    );
  }

  /**
   * Branch Managers Commission report: each branch's total sales for the period × its assigned
   * manager's commissionRate — attributed to the branch itself (SalesInvoice.branchId), not
   * whichever employee actually created each invoice, so a manager's commission always reflects
   * everything sold under their branch regardless of who rang it up. One row per branch (even a
   * branch with no assigned manager or no sales in the period still appears, with zeros), so the
   * report never needs a manager picked per invoice — it's derived entirely from the branch.
   *
   * commissionAmount is computed per invoice LINE (not a flat totalSales × generalRate anymore),
   * since a manager's CommissionException list can override the rate for a specific product or
   * product category: a line's rate is its product-specific exception, else its category's
   * exception, else the manager's own general commissionRate. totalSales stays SUM(lineTotal),
   * which is numerically identical to the old SUM(grandTotal) — sales invoices have no header-level
   * tax/discount in this system, so grandTotal === subtotal === SUM(lines.lineTotal) always.
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
    const branchRows = await this.dataSource
      .createQueryBuilder()
      .select('b.id', 'branchId')
      .addSelect('COALESCE(b."nameAr", b."nameEn")', 'branchName')
      .addSelect('r.id', 'managerId')
      .addSelect('r.name', 'managerName')
      .addSelect('COALESCE(r."commissionRate", 0)', 'commissionRate')
      .from('branches', 'b')
      .leftJoin('sales_representatives', 'r', 'r."branchId" = b.id')
      .where('b."companyId" = :companyId', { companyId })
      .setParameters({ companyId })
      .orderBy('b."nameAr"', 'ASC')
      .getRawMany();

    const lineRows = await this.dataSource
      .createQueryBuilder()
      .select('i."branchId"', 'branchId')
      .addSelect('l."lineTotal"', 'lineTotal')
      .addSelect('l."productId"', 'productId')
      .addSelect('p."categoryId"', 'categoryId')
      .from('sales_invoice_lines', 'l')
      .innerJoin('sales_invoices', 'i', 'i.id = l."invoiceId"')
      .innerJoin('products', 'p', 'p.id = l."productId"')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."branchId" IS NOT NULL')
      .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo })
      .getRawMany();

    const exceptionRows = await this.commissionExceptionsRepo.find({ where: { companyId } });
    const exceptionsByRepId = new Map<
      string,
      { byProductId: Map<string, number>; byCategoryId: Map<string, number> }
    >();
    for (const e of exceptionRows) {
      if (!exceptionsByRepId.has(e.salesRepresentativeId)) {
        exceptionsByRepId.set(e.salesRepresentativeId, { byProductId: new Map(), byCategoryId: new Map() });
      }
      const bucket = exceptionsByRepId.get(e.salesRepresentativeId)!;
      if (e.productId) bucket.byProductId.set(e.productId, Number(e.commissionRate));
      else if (e.categoryId) bucket.byCategoryId.set(e.categoryId, Number(e.commissionRate));
    }

    const linesByBranchId = new Map<string, typeof lineRows>();
    for (const line of lineRows) {
      if (!linesByBranchId.has(line.branchId)) linesByBranchId.set(line.branchId, []);
      linesByBranchId.get(line.branchId)!.push(line);
    }

    return branchRows
      .map((r) => {
        const generalRate = Number(r.commissionRate);
        const exceptions = r.managerId ? exceptionsByRepId.get(r.managerId) : undefined;
        const lines = linesByBranchId.get(r.branchId) ?? [];
        let totalSales = 0;
        let commissionAmount = 0;
        for (const line of lines) {
          const rate = this.resolveLineRate(line, exceptions, generalRate);
          // Same exclusion as getManagerBranchSalesForPeriod/buildManagerDashboardForRep: a
          // resolved rate of 0% means this sale isn't commissionable, so it's excluded from
          // totalSales too, not just from commissionAmount — this column represents commissionable
          // sales only, not the branch's raw revenue.
          if (rate <= 0) continue;
          const lineTotal = Number(line.lineTotal);
          totalSales += lineTotal;
          commissionAmount += (lineTotal * rate) / 100;
        }
        return {
          branchId: r.branchId,
          branchName: r.branchName,
          managerId: r.managerId,
          managerName: r.managerName,
          totalSales,
          commissionRate: generalRate,
          commissionAmount,
        };
      })
      .sort((a, b) => b.commissionAmount - a.commissionAmount);
  }

  /** Looks up this employee's payroll figures for one specific (year, month) — null when no
   * payroll run covers that month yet (the manager dashboard shows an empty state for it). */
  private async getPayrollMonthSnapshot(employeeId: string, companyId: string, year: number, month: number) {
    const line = await this.payrollRunLineRepo
      .createQueryBuilder('l')
      .innerJoinAndSelect('l.payrollRun', 'run')
      .where('l."employeeId" = :employeeId', { employeeId })
      .andWhere('run."companyId" = :companyId', { companyId })
      .andWhere('run.year = :year', { year })
      .andWhere('run.month = :month', { month })
      .getOne();
    if (!line) return null;

    return {
      year,
      month,
      baseSalary: Number(line.baseSalary),
      absenceDays: Number(line.absenceDays),
      lateHours: Number(line.lateHours),
      absenceDeduction: Number(line.absenceDeduction),
      lateDeduction: Number(line.lateDeduction),
      otherDeductions: Number(line.otherDeductions),
      totalDeductions: Number(line.absenceDeduction) + Number(line.lateDeduction) + Number(line.otherDeductions),
      netSalary: Number(line.netSalary),
      status: line.payrollRun.status,
    };
  }

  /** The 3 (year, month) pairs a quarter-shaped [dateFrom, dateTo] spans — "لوحة المدير" is always
   * filtered to exactly one quarter, so this just walks forward from dateFrom's own (year, month)
   * instead of taking quarter/year as separate params the caller would have to keep in sync with
   * the date range it already computed. */
  private monthsInDateRange(dateFrom: string): { year: number; month: number }[] {
    const [y, m] = dateFrom.split('-').map(Number);
    return [0, 1, 2].map((i) => {
      const d = new Date(y, m - 1 + i, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }

  /**
   * Self-service dashboard for a logged-in branch manager ("لوحة المدير"): their own sales total
   * and commission for the given date range (scoped to their own branch only, same exception-aware
   * math as getBranchManagersCommission), plus a payroll snapshot for each of the 3 months the
   * selected quarter spans.
   */
  async getManagerDashboard(companyId: string, userId: string, dateFrom: string, dateTo: string) {
    const rep = await this.repo.findOne({ where: { userId, companyId } as any, relations: ['branch'] });
    if (!rep) throw new NotFoundException('لا يوجد سجل مدير فرع مرتبط بحسابك');
    return this.buildManagerDashboardForRep(rep, companyId, dateFrom, dateTo);
  }

  /**
   * Admin drill-down variant of getManagerDashboard() — same computation, just keyed by the
   * SalesRepresentative's own id instead of resolving it from the caller's JWT, so an admin (who
   * has sales-representatives.view) can inspect any one manager's dashboard from "لوحة المدير"
   * without having to log in as them.
   */
  async getManagerDashboardByRepId(companyId: string, repId: string, dateFrom: string, dateTo: string) {
    const rep = await this.repo.findOne({ where: { id: repId, companyId } as any, relations: ['branch'] });
    if (!rep) throw new NotFoundException('مدير الفرع غير موجود');
    return this.buildManagerDashboardForRep(rep, companyId, dateFrom, dateTo);
  }

  private async buildManagerDashboardForRep(
    rep: SalesRepresentative,
    companyId: string,
    dateFrom: string,
    dateTo: string,
  ) {
    const generalRate = Number(rep.commissionRate ?? 0);
    const lineRows = rep.branchId
      ? await this.dataSource
          .createQueryBuilder()
          .select('l.id', 'lineId')
          .addSelect('i.id', 'invoiceId')
          .addSelect('i."documentNumber"', 'documentNumber')
          .addSelect('i."invoiceDate"', 'invoiceDate')
          .addSelect('l."lineTotal"', 'lineTotal')
          .addSelect('l."productId"', 'productId')
          .addSelect('p."categoryId"', 'categoryId')
          .addSelect('COALESCE(p."nameAr", p."nameEn")', 'productName')
          .from('sales_invoice_lines', 'l')
          .innerJoin('sales_invoices', 'i', 'i.id = l."invoiceId"')
          .innerJoin('products', 'p', 'p.id = l."productId"')
          .where('i."companyId" = :companyId', { companyId })
          .andWhere('i."branchId" = :branchId', { branchId: rep.branchId })
          .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo })
          .orderBy('i."invoiceDate"', 'DESC')
          .addOrderBy('i."documentNumber"', 'DESC')
          .getRawMany()
      : [];

    const exceptionRows = await this.commissionExceptionsRepo.find({
      where: { companyId, salesRepresentativeId: rep.id },
    });
    const exceptions = { byProductId: new Map<string, number>(), byCategoryId: new Map<string, number>() };
    for (const e of exceptionRows) {
      if (e.productId) exceptions.byProductId.set(e.productId, Number(e.commissionRate));
      else if (e.categoryId) exceptions.byCategoryId.set(e.categoryId, Number(e.commissionRate));
    }

    // Only lines this manager actually earns a commission on ever reach the dashboard — a resolved
    // rate of 0% (no general rate and no exception, or an exception explicitly zeroing it out) means
    // this sale isn't "his" for commission purposes, so it's excluded from both the sales list AND
    // totalSales, not just from the commission total.
    let totalSales = 0;
    let commissionAmount = 0;
    const items: {
      lineId: string;
      invoiceId: string;
      documentNumber: string;
      invoiceDate: string;
      productName: string;
      lineTotal: number;
      commissionRate: number;
      commissionAmount: number;
    }[] = [];
    for (const line of lineRows) {
      const rate = this.resolveLineRate(line, exceptions, generalRate);
      if (rate <= 0) continue;
      const lineTotal = Number(line.lineTotal);
      const lineCommission = (lineTotal * rate) / 100;
      totalSales += lineTotal;
      commissionAmount += lineCommission;
      items.push({
        lineId: line.lineId,
        invoiceId: line.invoiceId,
        documentNumber: line.documentNumber,
        invoiceDate: line.invoiceDate,
        productName: line.productName,
        lineTotal,
        commissionRate: rate,
        commissionAmount: lineCommission,
      });
    }

    const employee = rep.userId
      ? await this.employeeRepo.findOne({ where: { userId: rep.userId, companyId } as any })
      : null;

    const months = this.monthsInDateRange(dateFrom);
    const payrollMonths = employee
      ? await Promise.all(months.map((m) => this.getPayrollMonthSnapshot(employee.id, companyId, m.year, m.month)))
      : months.map(() => null);

    return {
      manager: {
        id: rep.id,
        name: rep.name,
        branchName: (rep as any).branch?.nameAr || (rep as any).branch?.nameEn || null,
      },
      employee: employee ? { baseSalary: Number(employee.baseSalary), jobTitle: employee.jobTitle } : null,
      sales: { totalSales, items },
      commission: { generalRate, amount: commissionAmount },
      payroll: {
        hasEmployeeRecord: !!employee,
        months: payrollMonths,
      },
    };
  }

  /** The actual invoices behind the "حجم المبيعات" chart bar(s) — same population (rep IS NOT NULL, or one specific rep) and date range as getReportsSummary, so the table always reconciles with the chart. */
  async getReportsInvoices(companyId: string, dateFrom: string, dateTo: string, representativeId?: string) {
    // Same createdById fallback as getReportsSummary — an invoice with no salesRepresentativeId
    // still resolves to whichever rep's own userId equals its createdById, so this table always
    // reconciles with that chart's totals.
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
      .leftJoin(
        'sales_representatives',
        'r2',
        'r2."userId" = i."createdById" AND r2."companyId" = i."companyId" AND i."salesRepresentativeId" IS NULL',
      )
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."invoiceDate" >= :dateFrom AND i."invoiceDate" <= :dateTo', { dateFrom, dateTo });
    if (representativeId) {
      qb.andWhere('COALESCE(i."salesRepresentativeId", r2.id) = :representativeId', { representativeId });
    } else {
      qb.andWhere('(i."salesRepresentativeId" IS NOT NULL OR r2.id IS NOT NULL)');
    }

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
  /** Self-service "لوحة المدير" dashboard — no @Permissions decorator, matching
   * UsersController.getOwnProfile's pattern, since a مدير فرع has no sales-representatives.*
   * permission. Declared before the :id-shaped routes below so 'me' is never captured as an id. */
  @Get('me/dashboard')
  meDashboard(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.service.getManagerDashboard(companyId, userId, dateFrom, dateTo);
  }
  /** Admin drill-down for "لوحة المدير" — lets anyone with sales-representatives.view pick a
   * specific manager from a list and inspect their dashboard, instead of only ever seeing their
   * own (which is meaningless for an admin who isn't a branch manager themselves). */
  @Get(':id/dashboard')
  @Permissions('sales-representatives.view')
  managerDashboardByRepId(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
  ) {
    return this.service.getManagerDashboardByRepId(companyId, id, dateFrom, dateTo);
  }
  @Get(':id/commission-exceptions')
  @Permissions('sales-representatives.view')
  listCommissionExceptions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.listCommissionExceptions(companyId, id);
  }
  @Post(':id/commission-exceptions')
  @Permissions('sales-representatives.edit')
  addCommissionException(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommissionExceptionDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.addCommissionException(companyId, id, dto);
  }
  @Delete(':id/commission-exceptions/:exceptionId')
  @Permissions('sales-representatives.edit')
  removeCommissionException(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('exceptionId', ParseUUIDPipe) exceptionId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeCommissionException(companyId, id, exceptionId);
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
