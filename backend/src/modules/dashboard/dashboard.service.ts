import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CashMovementsService } from '../treasury/cash-movements.service';
import { CashMovementAccount } from '../../entities/enums';
import { SalesRepAccessService } from '../../common/services/sales-rep-access.service';
import { Company } from '../settings/entities/company.entity';

/** Mirrors frontend/src/lib/use-active-company.ts's PRINTING_PRESS_COMPANY_CODE. */
const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

// Fixed business timezone (Asia/Kuwait, UTC+3, no DST) rather than the Node process's own system
// timezone (commonly UTC in production) — otherwise "today" flips a day early/late for roughly
// three hours around each local midnight, silently zeroing out same-day dashboard totals (sales,
// purchases, profit) until the server's UTC calendar date catches up with the user's local one.
const BUSINESS_UTC_OFFSET_HOURS = 3;

function nowInBusinessTimezone(): Date {
  return new Date(Date.now() + BUSINESS_UTC_OFFSET_HOURS * 60 * 60 * 1000);
}

// getUTC*() on the shifted instant reads off the business-timezone calendar date/time directly,
// independent of both the real UTC offset and whatever timezone the Node process happens to run in.
function today(): string {
  return nowInBusinessTimezone().toISOString().slice(0, 10);
}

function monthStart(): string {
  const d = nowInBusinessTimezone();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cashMovementsService: CashMovementsService,
    private readonly salesRepAccess: SalesRepAccessService,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
  ) {}

  /**
   * `branchId` (Printing Press only — the Dashboard's Branch filter) narrows every card to one
   * branch: sales/revenue figures via the invoice/payment's sales representative's branch (the
   * only branch signal actually populated on sales_invoices/sales_payments today — same join
   * CashMovementsService.getProfitReport() and SalesInvoicesService.getSalesLines() already use),
   * purchases/COGS via PurchaseReceipt.branchId, inventory value via Warehouse.branchId, and the
   * cash/bank treasury balances via CashMovement.branchId. Omitted/undefined means every branch
   * combined for an admin; a non-admin (e.g. a branch Manager) is pinned to their own branch via
   * SalesRepAccessService.resolveBranchId() regardless of what the client requests.
   */
  async getSummary(companyId: string, userId: string, requestedBranchId?: string) {
    const branchId = (await this.salesRepAccess.resolveBranchId(userId, requestedBranchId, companyId)) ?? undefined;
    const todayDate = today();
    const monthStartDate = monthStart();
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    const isPress = company?.code === PRINTING_PRESS_COMPANY_CODE;

    const [
      dailySalesRow,
      dailyPurchasesRow,
      monthlyRevenueRow,
      outstandingCustomerRow,
      inventoryValueRow,
      cashBalance,
      bankBalance,
      todaySalesRows,
      incomeStatement,
    ] = await Promise.all([
      (() => {
        const qb = this.dataSource
          .createQueryBuilder()
          .select('COALESCE(SUM(i."grandTotal"),0)', 'total')
          .from('sales_invoices', 'i')
          .leftJoin('sales_representatives', 'rep', 'rep.id = i."salesRepresentativeId"')
          .where('i."companyId" = :companyId', { companyId })
          .andWhere('i."invoiceDate" = :d', { d: todayDate });
        if (branchId) qb.andWhere('rep."branchId" = :branchId', { branchId });
        return qb.getRawOne();
      })(),
      (() => {
        const qb = this.dataSource
          .createQueryBuilder()
          .select('COALESCE(SUM(r."totalAmount"),0)', 'total')
          .from('purchase_receipts', 'r')
          .where('r."companyId" = :companyId', { companyId })
          .andWhere('r."receiptDate" = :d', { d: todayDate });
        if (branchId) qb.andWhere('r."branchId" = :branchId', { branchId });
        return qb.getRawOne();
      })(),
      // Printing Press: accrual-basis revenue — the FULL value of every invoice issued this month
      // (i."grandTotal"), matching exactly what the Sales Chart and the Sales Invoices log both
      // already total for the same branch (both read straight off sales_invoices, never off
      // sales_payments). A Press invoice is filtered by its own i."branchId" column directly, not
      // via a join through its optional salesRepresentativeId — that join is what silently zeroed
      // this figure for walk-in invoices with no rep (see getProfitReport()'s identical fix).
      //
      // Every other company keeps the original cash-basis figure: only actual customer payments
      // collected this month — whether paid up front at invoice creation or collected later
      // against outstanding debt — since both paths always create a sales_payments row. Unpaid/
      // credit invoices never appear here; they only ever show up in outstandingCustomerBalances
      // until they're actually paid.
      (() => {
        if (isPress) {
          const qb = this.dataSource
            .createQueryBuilder()
            .select('COALESCE(SUM(i."grandTotal"),0)', 'total')
            .from('sales_invoices', 'i')
            .where('i."companyId" = :companyId', { companyId })
            .andWhere('i."invoiceDate" >= :d', { d: monthStartDate })
            .andWhere("i.status != 'CANCELLED'");
          if (branchId) qb.andWhere('i."branchId" = :branchId', { branchId });
          return qb.getRawOne();
        }
        const qb = this.dataSource
          .createQueryBuilder()
          .select('COALESCE(SUM(p.amount),0)', 'total')
          .from('sales_payments', 'p')
          .leftJoin('sales_representatives', 'rep', 'rep.id = p."salesRepresentativeId"')
          .where('p."companyId" = :companyId', { companyId })
          .andWhere('p."paymentDate" >= :d', { d: monthStartDate });
        if (branchId) qb.andWhere('rep."branchId" = :branchId', { branchId });
        return qb.getRawOne();
      })(),
      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(SUM(i."grandTotal" - i."amountPaid"),0)', 'total')
        .from('sales_invoices', 'i')
        .where('i."companyId" = :companyId', { companyId })
        .andWhere("i.status NOT IN ('CANCELLED')")
        .getRawOne(),
      (() => {
        const qb = this.dataSource
          .createQueryBuilder()
          .select('COALESCE(SUM(sl."quantityOnHand" * sl."averageCost"),0)', 'total')
          .from('stock_levels', 'sl')
          .leftJoin('warehouses', 'w', 'w.id = sl."warehouseId"')
          .where('sl."companyId" = :companyId', { companyId });
        if (branchId) qb.andWhere('w."branchId" = :branchId', { branchId });
        return qb.getRawOne();
      })(),
      this.cashMovementsService.getBalance(companyId, CashMovementAccount.CASH, todayDate, branchId),
      this.cashMovementsService.getBalance(companyId, CashMovementAccount.BANK, todayDate, branchId),
      (() => {
        const qb = this.dataSource
          .createQueryBuilder()
          .select('COALESCE(SUM(i.subtotal),0)', 'revenue')
          .addSelect('COALESCE(SUM(i."costOfGoodsSold"),0)', 'cogs')
          .from('sales_invoices', 'i')
          .leftJoin('sales_representatives', 'rep', 'rep.id = i."salesRepresentativeId"')
          .where('i."companyId" = :companyId', { companyId })
          .andWhere('i."invoiceDate" = :d', { d: todayDate });
        if (branchId) qb.andWhere('rep."branchId" = :branchId', { branchId });
        return qb.getRawOne();
      })(),
      // "مصروفات الشهر": the exact same query the Expenses screen's own report reads (manually
      // recorded operating expenses + payroll postings, grouped by category — see
      // getExpenseReport()'s own doc comment), scoped to this calendar month and the requested
      // branch. A failure here used to be swallowed into a silent `null` (rendering as an
      // innocent-looking 0.00 with no indication anything was wrong) — now logged so a genuine
      // query failure is diagnosable instead of masquerading as "no expenses this month".
      this.cashMovementsService.getExpenseReport(companyId, monthStartDate, todayDate, branchId).catch((err) => {
        this.logger.error(`getExpenseReport failed for company ${companyId}: ${err?.message ?? err}`, err?.stack);
        return null;
      }),
    ]);

    const profitToday = Number(todaySalesRows?.revenue ?? 0) - Number(todaySalesRows?.cogs ?? 0);

    return {
      dailySales: Number(dailySalesRow?.total ?? 0),
      dailyPurchases: Number(dailyPurchasesRow?.total ?? 0),
      cashBalance,
      bankBalance,
      profitToday,
      monthlyRevenue: Number(monthlyRevenueRow?.total ?? 0),
      monthlyExpenses: incomeStatement?.totalExpenses ?? 0,
      outstandingCustomerBalances: Number(outstandingCustomerRow?.total ?? 0),
      inventoryValue: Number(inventoryValueRow?.total ?? 0),
    };
  }

  /**
   * `branchId` (Printing Press only — the Dashboard's Branch filter, resolved the same way
   * getSummary() resolves it: an admin gets whatever they request, a non-admin is pinned to their
   * own branch) narrows this to one branch via the invoice's own i."branchId" column — the same
   * source getSummary()'s Press-only monthlyRevenue query and the Sales Invoices log both read, so
   * this chart's total for a given period always matches the "إيرادات الشهر" card and the invoices
   * log for that period/branch.
   */
  async getSalesChart(companyId: string, userId: string, requestedBranchId?: string, days = 30) {
    const branchId = (await this.salesRepAccess.resolveBranchId(userId, requestedBranchId, companyId)) ?? undefined;
    const qb = this.dataSource
      .createQueryBuilder()
      .select('i."invoiceDate"', 'date')
      .addSelect('COALESCE(SUM(i."grandTotal"),0)', 'total')
      .from('sales_invoices', 'i')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere(`i."invoiceDate" >= (CURRENT_DATE - INTERVAL '${days} days')`);
    if (branchId) qb.andWhere('i."branchId" = :branchId', { branchId });
    const rows = await qb.groupBy('i."invoiceDate"').orderBy('i."invoiceDate"', 'ASC').getRawMany();
    return rows.map((r) => ({ date: r.date, total: Number(r.total) }));
  }

  /**
   * `purchase_invoices` has no `companyId` column of its own (the whole purchasing module predates
   * this multi-tenant retrofit and is out of scope here) — scoped indirectly via the supplier,
   * which IS company-scoped, since every purchase invoice's supplier belongs to exactly one company.
   */
  async getPurchaseChart(companyId: string, days = 30) {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('i."invoiceDate"', 'date')
      .addSelect('COALESCE(SUM(i."grandTotal"),0)', 'total')
      .from('purchase_invoices', 'i')
      .innerJoin('suppliers', 's', 's.id = i."supplierId"')
      .where('s."companyId" = :companyId', { companyId })
      .andWhere(`i."invoiceDate" >= (CURRENT_DATE - INTERVAL '${days} days')`)
      .groupBy('i."invoiceDate"')
      .orderBy('i."invoiceDate"', 'ASC')
      .getRawMany();
    return rows.map((r) => ({ date: r.date, total: Number(r.total) }));
  }

  async getTopSellingProducts(companyId: string, limit = 5) {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('p.id', 'productId')
      .addSelect('p."nameEn"', 'name')
      .addSelect('SUM(l.quantity)', 'totalQuantity')
      .addSelect('SUM(l."lineTotal")', 'totalRevenue')
      .from('sales_invoice_lines', 'l')
      .innerJoin('products', 'p', 'p.id = l."productId"')
      .where('p."companyId" = :companyId', { companyId })
      .groupBy('p.id')
      .orderBy('"totalQuantity"', 'DESC')
      .limit(limit)
      .getRawMany();
    return rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      totalQuantity: Number(r.totalQuantity),
      totalRevenue: Number(r.totalRevenue),
    }));
  }

  async getExpiredProducts(companyId: string) {
    return this.dataSource
      .createQueryBuilder()
      .select('b.*')
      .addSelect('p."nameEn"', 'productName')
      .from('product_batches', 'b')
      .innerJoin('products', 'p', 'p.id = b."productId"')
      .where('b."companyId" = :companyId', { companyId })
      .andWhere('b."expirationDate" < CURRENT_DATE')
      .andWhere('b.quantity > 0')
      .getRawMany();
  }

  /**
   * Delegates straight to CashMovementsService — kept as its own dashboard method (same URL,
   * same response shape) so TreasuryTransactionsPage.tsx needed zero frontend changes when the
   * underlying ledger moved off the double-entry GL onto direct CashMovement rows. A non-admin
   * (e.g. a branch Manager) only ever sees their own branch's movements — see getSummary() above
   * for the same resolveBranchId() pattern.
   */
  async getCashLedger(companyId: string, userId: string, dateFrom?: string, dateTo?: string) {
    const branchId = (await this.salesRepAccess.resolveBranchId(userId, undefined, companyId)) ?? undefined;
    return this.cashMovementsService.getLedger(companyId, dateFrom, dateTo, branchId);
  }

  async getRecentTransactions(companyId: string, limit = 10) {
    const rows = await this.dataSource.query(
      `
      (SELECT 'SALES_INVOICE' as type, "documentNumber", "invoiceDate" as date, "grandTotal" as amount, "createdAt"
       FROM sales_invoices WHERE "companyId" = $1)
      UNION ALL
      (SELECT 'SALES_PAYMENT' as type, "documentNumber", "paymentDate" as date, amount, "createdAt"
       FROM sales_payments WHERE "companyId" = $1)
      ORDER BY "createdAt" DESC
      LIMIT $2
      `,
      [companyId, limit],
    );
    return rows;
  }
}
