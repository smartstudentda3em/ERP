import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, QueryFailedError, Repository } from 'typeorm';
import { CashMovement } from './entities/cash-movement.entity';
import { CashMovementAccount, CashMovementSourceType, CashMovementType } from '../../entities/enums';
import { NumberingSeriesService } from '../settings/numbering-series.controller';
import { Company } from '../settings/entities/company.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

/** Mirrors frontend/src/lib/use-active-company.ts's PRINTING_PRESS_COMPANY_CODE. */
const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

/**
 * Postgres unique_violation on cash_movements specifically (not some unrelated constraint) —
 * matched by table rather than the exact TypeORM-generated constraint name. That name is a hash
 * derived from the table/column names at schema-sync time, which silently drifts if the schema was
 * ever synced under a different TypeORM version or the entity's table/column briefly changed —
 * a stale hardcoded hash here would make this check quietly stop matching, the retry below would
 * never fire, and the raw "duplicate key value violates unique constraint ..." error would reach
 * the caller unhandled instead of self-healing. cash_movements carries exactly one unique
 * constraint (documentNumber — see the entity), so a 23505 on this table is unambiguous.
 */
function isDuplicateDocumentNumber(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = (err as QueryFailedError & { driverError?: { code?: string; table?: string } }).driverError;
  return driverError?.code === '23505' && driverError?.table === 'cash_movements';
}

export interface RecordCashMovementInput {
  companyId: string;
  branchId?: string | null;
  movementDate: string;
  type: CashMovementType;
  account: CashMovementAccount;
  amount: number;
  sourceType: CashMovementSourceType;
  sourceId?: string | null;
  category?: string | null;
  partyCustomerId?: string | null;
  partySupplierId?: string | null;
  partnerId?: string | null;
  salesRepresentativeId?: string | null;
  description?: string | null;
  createdById: string;
}

/**
 * Every module that moves cash (sales payments, purchase payments, manual income/expense) goes
 * through this service instead of the old JournalPostingService — one row per actual movement,
 * no debit/credit account pairs to keep balanced. This is what makes the Treasury ledger, the
 * Dashboard's cash/bank KPIs, and the expense/profit reports all agree by construction.
 */
@Injectable()
export class CashMovementsService {
  constructor(
    @InjectRepository(CashMovement) private readonly repo: Repository<CashMovement>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {}

  async record(input: RecordCashMovementInput, manager?: EntityManager): Promise<CashMovement> {
    if (manager) {
      // Already inside the caller's transaction (e.g. the legacy dual-row capital-injection path)
      // — reserve and insert on that same manager so a rolled-back insert rolls the reservation
      // back with it too, instead of the two drifting out of sync.
      const documentNumber = await this.reserveDocumentNumber(input.companyId, manager);
      return this.insertRow(input, documentNumber, manager);
    }
    // No caller-provided transaction: retry with a freshly-reserved number if the insert ever
    // collides on documentNumber (e.g. a numbering series left out of sync with rows already in
    // the table — the exact "duplicate key value violates unique constraint" failure this guards
    // against). The reservation is deliberately its OWN committed transaction, separate from the
    // insert below — reserving and inserting as one atomic unit (as this used to) means a failed
    // insert rolls its own just-reserved number back right along with it, so every retry re-reads
    // the SAME stale nextNumber and re-collides on the SAME number forever instead of advancing:
    // three attempts, three identical failures, the raw Postgres error surfacing to the caller
    // exactly like there were no retry at all. Reserving independently means the increment survives
    // the insert's rollback, so the very next attempt is guaranteed a number that hasn't been tried.
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const documentNumber = await this.reserveDocumentNumber(input.companyId);
      try {
        return await this.dataSource.transaction((txManager) => this.insertRow(input, documentNumber, txManager));
      } catch (err) {
        if (attempt === MAX_ATTEMPTS || !isDuplicateDocumentNumber(err)) throw err;
      }
    }
    throw new Error('unreachable');
  }

  private async reserveDocumentNumber(companyId: string, manager?: EntityManager): Promise<string> {
    return (
      (await this.numberingSeriesService.tryGetNextNumber(companyId, 'CASH_MOVEMENT', manager)) ??
      `CM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
  }

  private async insertRow(
    input: RecordCashMovementInput,
    documentNumber: string,
    manager: EntityManager,
  ): Promise<CashMovement> {
    const repo = manager.getRepository(CashMovement);
    const row = repo.create({
      documentNumber,
      movementDate: input.movementDate,
      type: input.type,
      account: input.account,
      amount: input.amount,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      category: input.category ?? null,
      partyCustomerId: input.partyCustomerId ?? null,
      partySupplierId: input.partySupplierId ?? null,
      partnerId: input.partnerId ?? null,
      salesRepresentativeId: input.salesRepresentativeId ?? null,
      description: input.description ?? null,
      companyId: input.companyId,
      branchId: input.branchId ?? null,
      createdById: input.createdById,
    });
    return repo.save(row);
  }

  /**
   * Removes any cash movement recorded for a given source document — used when the source
   * itself is being edited or deleted and needs to reverse its own cash-flow side effect first
   * (e.g. a purchase receipt's paid-amount debit). Reversing by delete-then-recreate rather than
   * patching the amount in place is what lets the caller treat "payment added/removed/changed
   * between edits" uniformly instead of as three separate cases.
   */
  async removeBySource(
    companyId: string,
    sourceType: CashMovementSourceType,
    sourceId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager ? manager.getRepository(CashMovement) : this.repo;
    await repo.delete({ companyId, sourceType, sourceId });
  }

  /**
   * Moves the business's own money between its Cash and Bank accounts — an EXPENSE row on the
   * source account paired with an INCOME row on the destination, both dated/amounted identically
   * and linked via sourceId (same pattern as a capital injection's linked CASH/BANK pair). Neither
   * row is revenue or a real expense, so sourceType TRANSFER keeps them out of every P&L report
   * (getExpenseReport/getProfitReport only ever look at sourceType MANUAL) while still appearing
   * in the combined Treasury ledger, where the two legs net to zero — exactly right, since an
   * internal transfer can't change the combined balance, only its Cash/Bank split.
   */
  async createTransfer(
    companyId: string,
    input: {
      movementDate: string;
      fromAccount: CashMovementAccount;
      toAccount: CashMovementAccount;
      amount: number;
      description?: string | null;
      branchId?: string | null;
      // Required exactly when fromAccount is REP_TREASURY — this is the "تسوية عهدة مندوب"
      // settlement path: clearing one specific rep's own uncleared-sales pocket into the
      // company's real CASH/BANK. Never set for a plain CASH<->BANK transfer.
      fromSalesRepresentativeId?: string | null;
    },
    createdById: string,
  ): Promise<{ from: CashMovement; to: CashMovement }> {
    if (input.fromAccount === input.toAccount) {
      throw new BadRequestException('Source and destination accounts must be different');
    }
    if (input.fromAccount === CashMovementAccount.REP_TREASURY && !input.fromSalesRepresentativeId) {
      throw new BadRequestException('يجب تحديد المندوب عند التحويل من خزينة المندوب');
    }

    return this.dataSource.transaction(async (manager) => {
      // Settling a رep's pocket is the one transfer direction that can actually overdraw — a
      // plain CASH<->BANK transfer already implicitly can't exceed what's really there once every
      // other balance check in this file is doing its job, but a rep's own pocket has never been
      // checked before this point, so this is the first and only gate on it.
      if (input.fromAccount === CashMovementAccount.REP_TREASURY) {
        await this.assertSufficientBalance(
          companyId,
          input.fromAccount,
          input.amount,
          input.branchId,
          manager,
          0,
          input.fromSalesRepresentativeId!,
        );
      }
      const from = await this.record(
        {
          companyId,
          branchId: input.branchId ?? null,
          movementDate: input.movementDate,
          type: CashMovementType.EXPENSE,
          account: input.fromAccount,
          salesRepresentativeId: input.fromSalesRepresentativeId ?? null,
          amount: input.amount,
          sourceType: CashMovementSourceType.TRANSFER,
          description: input.description ?? null,
          createdById,
        },
        manager,
      );
      const to = await this.record(
        {
          companyId,
          branchId: input.branchId ?? null,
          movementDate: input.movementDate,
          type: CashMovementType.INCOME,
          account: input.toAccount,
          amount: input.amount,
          sourceType: CashMovementSourceType.TRANSFER,
          sourceId: from.id,
          description: input.description ?? null,
          createdById,
        },
        manager,
      );
      if (input.fromAccount === CashMovementAccount.REP_TREASURY) {
        await this.settleRepTreasuryFifo(companyId, input.fromSalesRepresentativeId!, input.amount, manager);
      }
      return { from, to };
    });
  }

  /**
   * Marks specific outstanding رep-collected invoices/receipts as cleared once their value has
   * actually been transferred out of a rep's REP_TREASURY pocket — walks that rep's unsettled
   * INCOME rows oldest-first, incrementing each one's settledAmount until `amount` is fully
   * consumed (a row can be partially settled; the entered transfer amount never has to land on an
   * exact invoice boundary). This is what lets the "خزينة المناديب" breakdown show exactly which
   * invoices/receipts still make up a rep's balance — see getRepTreasuryBreakdown below — while
   * assertSufficientBalance (already called by the caller before this runs) guarantees `amount`
   * never exceeds the sum of every row's remaining (amount - settledAmount), so this loop always
   * fully consumes it.
   */
  private async settleRepTreasuryFifo(
    companyId: string,
    salesRepresentativeId: string,
    amount: number,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(CashMovement);
    const rows = await repo
      .createQueryBuilder('m')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere('m."salesRepresentativeId" = :salesRepresentativeId', { salesRepresentativeId })
      .andWhere('m.account = :account', { account: CashMovementAccount.REP_TREASURY })
      .andWhere('m.type = :type', { type: CashMovementType.INCOME })
      .andWhere('(m.amount - m."settledAmount") > 0.005')
      .orderBy('m."movementDate"', 'ASC')
      .addOrderBy('m."createdAt"', 'ASC')
      .getMany();

    let remaining = amount;
    for (const row of rows) {
      if (remaining <= 0.005) break;
      const rowRemaining = Number(row.amount) - Number(row.settledAmount);
      const consume = Math.min(rowRemaining, remaining);
      row.settledAmount = Number(row.settledAmount) + consume;
      remaining -= consume;
      await repo.save(row);
    }
  }

  /**
   * The "خزينة المناديب" detail screen's per-rep breakdown (Stationery only) — every still-
   * outstanding invoice/receipt that makes up a rep's current REP_TREASURY balance, i.e. every
   * INCOME row not yet fully cleared by settleRepTreasuryFifo above. An invoice's own upfront
   * payment (sourceType SALES_INVOICE, sourceId = the invoice) and a later follow-up collection
   * (sourceType SALES_PAYMENT, linked via sales_payments."cashMovementId" — that row never carries
   * its own sourceId) are resolved to a customer name and document number differently, since they
   * attribute back to their source document through two different columns. `dateFrom`/`dateTo`
   * only narrow what's *displayed*; settleRepTreasuryFifo itself always sweeps the full unsettled
   * set regardless of the caller's currently-applied filter.
   *
   * `salesRepresentativeId` is optional — omitted (the المناديب reports tab's "الكل" filter),
   * every rep's outstanding rows come back together (each carrying its own `repName`) instead of
   * being scoped to one rep, which is what lets that screen show a single combined total across
   * every مندوب for the selected date range.
   */
  async getRepTreasuryBreakdown(
    companyId: string,
    salesRepresentativeId?: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('m.id', 'id')
      .addSelect('to_char(m."movementDate", \'YYYY-MM-DD\')', 'date')
      .addSelect('m."sourceType"', 'sourceType')
      .addSelect('m.amount', 'amount')
      .addSelect('m."settledAmount"', 'settledAmount')
      .addSelect('sr.name', 'repName')
      .addSelect('COALESCE(inv."documentNumber", sp."documentNumber")', 'documentNumber')
      .addSelect('COALESCE(invCustomer.name, spCustomer.name)', 'customerName')
      .from('cash_movements', 'm')
      .leftJoin('sales_representatives', 'sr', 'sr.id = m."salesRepresentativeId"')
      .leftJoin('sales_invoices', 'inv', `m."sourceType" = 'SALES_INVOICE' AND inv.id = m."sourceId"`)
      .leftJoin('customers', 'invCustomer', 'invCustomer.id = inv."customerId"')
      .leftJoin('sales_payments', 'sp', `m."sourceType" = 'SALES_PAYMENT' AND sp."cashMovementId" = m.id`)
      .leftJoin('customers', 'spCustomer', 'spCustomer.id = sp."customerId"')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere('m.account = :account', { account: CashMovementAccount.REP_TREASURY })
      .andWhere(`m.type = 'INCOME'`)
      .andWhere('(m.amount - m."settledAmount") > 0.005')
      .orderBy('m."createdAt"', 'DESC');

    if (salesRepresentativeId) qb.andWhere('m."salesRepresentativeId" = :salesRepresentativeId', { salesRepresentativeId });
    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      sourceType: r.sourceType as 'SALES_INVOICE' | 'SALES_PAYMENT',
      documentNumber: r.documentNumber ?? '—',
      customerName: r.customerName ?? '—',
      repName: r.repName ?? '—',
      remaining: Number(r.amount) - Number(r.settledAmount),
    }));
  }

  /**
   * One row per sales representative in the company with their current خزينة المندوب balance —
   * feeds the Treasury screen's settlement rep-picker (so an admin can see who owes how much
   * before choosing who to clear) and the "خزينة المندوب" summary card's total (sum every row).
   * Every SalesRepresentative row is included, not just "مندوب"-role ones, since a manually added
   * rep or a "مدير فرع" could theoretically also have REP_TREASURY movements — their balance is
   * just always 0 in practice, which the frontend can filter out for the picker if it wants only
   * reps actually worth settling.
   */
  async getRepTreasuryBalances(
    companyId: string,
  ): Promise<{ salesRepresentativeId: string; name: string; balance: number }[]> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('sr.id', 'salesRepresentativeId')
      .addSelect('sr.name', 'name')
      .addSelect(
        `COALESCE(SUM(CASE WHEN m.type = 'INCOME' THEN m.amount ELSE -m.amount END), 0)`,
        'balance',
      )
      .from('sales_representatives', 'sr')
      .leftJoin(
        'cash_movements',
        'm',
        'm."salesRepresentativeId" = sr.id AND m.account = :account',
        { account: CashMovementAccount.REP_TREASURY },
      )
      .where('sr."companyId" = :companyId', { companyId })
      .groupBy('sr.id')
      .orderBy('sr.name', 'ASC')
      .getRawMany();
    return rows.map((r) => ({
      salesRepresentativeId: r.salesRepresentativeId,
      name: r.name,
      balance: Number(r.balance),
    }));
  }

  /**
   * Current balance of one treasury account (CASH or BANK), optionally as of a given date.
   * A capital injection's BANK-tagged row is normally a partner-equity attribution memo of money
   * already counted via its linked CASH row (see PartnersTreasuryController.createCapitalInjection)
   * — it was never real bank-account money on its own, so it's excluded from the BANK balance,
   * otherwise every contribution would double-count once as real liquidity (via CASH) and again as
   * if it were a second, separate bank deposit (via BANK). That memo row always carries a sourceId
   * pointing back to its CASH twin. Printing Press's single-row contributions (caller picks CASH or
   * BANK, no twin, so sourceId is null) are real money in whichever account was chosen and must NOT
   * be excluded — hence gating the exclusion on sourceId rather than just sourceType.
   *
   * `branchId` (Printing Press only — the Dashboard's Branch filter) narrows the balance to
   * movements tagged with that branch (manual expenses, purchase receipt payments, capital
   * injections, dividends, transfers, sales invoice/payment receipts — see each recording call
   * site for how branchId is derived there). Omitted/undefined means every branch combined.
   */
  async getBalance(
    companyId: string,
    account: CashMovementAccount,
    asOfDate?: string,
    branchId?: string,
    manager?: EntityManager,
    // REP_TREASURY is a per-رep pocket, not one shared company-wide pool — every caller that
    // passes account=REP_TREASURY must also pass which rep's balance it means, or this would sum
    // every rep's uncleared sales together. Ignored (and harmless) for CASH/BANK.
    salesRepresentativeId?: string,
  ): Promise<number> {
    const qb = (manager ?? this.dataSource)
      .createQueryBuilder()
      .select(`COALESCE(SUM(CASE WHEN m.type = 'INCOME' THEN m.amount ELSE -m.amount END), 0)`, 'balance')
      .from('cash_movements', 'm')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere('m.account = :account', { account });
    if (account === CashMovementAccount.BANK) {
      qb.andWhere(`NOT (m."sourceType" = 'CAPITAL_INJECTION' AND m."sourceId" IS NOT NULL)`);
    }
    if (account === CashMovementAccount.REP_TREASURY) {
      qb.andWhere('m."salesRepresentativeId" = :salesRepresentativeId', { salesRepresentativeId });
    }
    if (asOfDate) qb.andWhere('m."movementDate" <= :asOfDate', { asOfDate });
    if (branchId) qb.andWhere('m."branchId" = :branchId', { branchId });
    const row = await qb.getRawOne();
    return Number(row?.balance ?? 0);
  }

  /**
   * Blocks any outgoing payment (purchase, expense, supplier payment, dividend, commission payout,
   * ...) that would drive a treasury account (Cash or Bank) negative, for every company. `excludeAmount`
   * lets a caller editing an existing movement in place (not yet deleted/replaced at call time) add
   * back that movement's own old amount before comparing, so replacing a payment doesn't falsely
   * count itself as an extra draw on the balance.
   */
  async assertSufficientBalance(
    companyId: string,
    account: CashMovementAccount,
    amount: number,
    branchId?: string | null,
    manager?: EntityManager,
    excludeAmount = 0,
    salesRepresentativeId?: string,
  ): Promise<void> {
    if (amount <= 0) return;

    const balance = await this.getBalance(
      companyId,
      account,
      undefined,
      branchId ?? undefined,
      manager,
      salesRepresentativeId,
    );
    const available = balance + excludeAmount;
    if (amount > available) {
      if (account === CashMovementAccount.CASH) {
        throw new BadRequestException(
          `عفواً، المبلغ المدفوع أكبر من الرصيد المتاح في الخزينة. الرصيد المالي المتاح حالياً هو ${available.toFixed(2)} د.ك`,
        );
      }
      if (account === CashMovementAccount.REP_TREASURY) {
        throw new BadRequestException(
          `عفواً، المبلغ أكبر من الرصيد المتاح في خزينة المندوب. الرصيد المالي المتاح حالياً هو ${available.toFixed(2)} د.ك`,
        );
      }
      throw new BadRequestException('عفواً، المبلغ المدفوع أكبر من الرصيد المتاح في البنك');
    }
  }

  /**
   * The Treasury ledger: every movement across both Cash and Bank, newest first, each carrying
   * the combined running balance immediately after it happened. A capital injection's BANK-tagged
   * memo row (sourceId set, pointing at its linked CASH row) is excluded here for the same reason
   * as getBalance() above — it's a partner-equity memo of money the linked CASH row already
   * represents as a real movement, not a second one; showing both would list (and sum) the same
   * contribution twice. Printing Press's single-row contributions (no sourceId) are real,
   * standalone movements and must stay visible.
   */
  async getLedger(companyId: string, dateFrom?: string, dateTo?: string, branchId?: string) {
    // Air Conditioning only — "الرصيد الإجمالي" must read as كاش + بنك alone, with خزينة المندوب
    // neither shown as its own summary card (see TreasuryTransactionsPage.tsx) nor folded into
    // this total; REP_TREASURY movements still appear as ordinary rows below for a full audit
    // trail, they just don't move the running balance carried alongside them.
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    const excludeRepTreasuryFromBalance = company?.code === 'AC';

    const qb = this.dataSource
      .createQueryBuilder()
      .select('m."movementDate"', 'date')
      .addSelect('m."sourceType"', 'sourceType')
      .addSelect('m."documentNumber"', 'documentNumber')
      .addSelect('m.account', 'account')
      .addSelect('m.type', 'type')
      .addSelect('m.amount', 'amount')
      .addSelect('m.category', 'category')
      .addSelect('m.description', 'description')
      .addSelect('m."branchId"', 'branchId')
      .addSelect('c.name', 'customerName')
      .addSelect('s."companyName"', 'supplierName')
      .from('cash_movements', 'm')
      .leftJoin('customers', 'c', 'c.id = m."partyCustomerId"')
      .leftJoin('suppliers', 's', 's.id = m."partySupplierId"')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere(`NOT (m.account = 'BANK' AND m."sourceType" = 'CAPITAL_INJECTION' AND m."sourceId" IS NOT NULL)`)
      .orderBy('m."createdAt"', 'ASC');

    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });
    if (branchId) qb.andWhere('m."branchId" = :branchId', { branchId });

    const rows = await qb.getRawMany();

    let runningBalance = 0;
    const entries = rows.map((row) => {
      const amount = Number(row.amount);
      const debit = row.type === 'INCOME' ? amount : 0;
      const credit = row.type === 'EXPENSE' ? amount : 0;
      const isRepTreasury = row.account === CashMovementAccount.REP_TREASURY;
      if (!(excludeRepTreasuryFromBalance && isRepTreasury)) {
        runningBalance += debit - credit;
      }
      return {
        date: row.date,
        movementType: row.sourceType,
        documentNumber: row.documentNumber,
        partyName: row.customerName ?? row.supplierName ?? row.category ?? null,
        paymentAccount: row.account,
        debit,
        credit,
        description: row.description,
        branchId: row.branchId,
        runningBalance,
      };
    });

    return entries.reverse();
  }

  /**
   * Sums EXPENSE-type cash movements of exactly one sourceType for a period/branch — shared by
   * getExpenseReport's salaries/commissions totals, kept as independent categories (rather than
   * folded into the MANUAL rows below) so the Expense Report can show Operating Expenses, Salaries,
   * and Commissions as three distinct, individually-labeled figures instead of one merged blob.
   */
  private async sumExpensesBySourceType(
    companyId: string,
    sourceType: CashMovementSourceType,
    dateFrom?: string,
    dateTo?: string,
    branchId?: string,
  ): Promise<number> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(m.amount), 0)', 'total')
      .from('cash_movements', 'm')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere('m.type = :type', { type: CashMovementType.EXPENSE })
      .andWhere('m."sourceType" = :sourceType', { sourceType });
    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });
    if (branchId) qb.andWhere('m."branchId" = :branchId', { branchId });
    const row = await qb.getRawOne();
    return Number(row?.total ?? 0);
  }

  /**
   * Expense report: manually-recorded operating expenses (rent, electricity, ...), grouped by
   * category, plus payroll (PAYROLL — see PayrollService.approve()) and commission payouts
   * (COMMISSION_PAYOUT — مندوب/مدير فرع payouts, see getCommissionPayouts) summed as their own
   * distinct totals rather than mixed into the categorized rows list, so Operating Expenses,
   * Salaries, and Commissions can each be shown/labeled on the Reports screen without one silently
   * absorbing another (previously PAYROLL was merged into `rows`/`totalExpenses` under the
   * "Operating Expenses" label, and COMMISSION_PAYOUT wasn't counted here at all).
   *
   * Deliberately excludes EXPENSE movements from supplier payments/purchase receipts — those are
   * balance-sheet cash-out-for-inventory movements, not P&L expenses; their cost only hits the P&L
   * via costOfGoodsSold on the units actually sold (see getProfitReport). Counting the full
   * purchase payment here as well would double-count inventory not yet sold. `branchId` (Printing
   * Press only) narrows this to expenses recorded against one branch.
   */
  async getExpenseReport(companyId: string, dateFrom?: string, dateTo?: string, branchId?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select(`COALESCE(m.category, m."sourceType"::text)`, 'label')
      .addSelect('COALESCE(SUM(m.amount), 0)', 'total')
      .from('cash_movements', 'm')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere(`m.type = 'EXPENSE'`)
      .andWhere(`m."sourceType" = 'MANUAL'`)
      .groupBy(`COALESCE(m.category, m."sourceType"::text)`)
      .orderBy('total', 'DESC');

    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });
    if (branchId) qb.andWhere('m."branchId" = :branchId', { branchId });

    const rows = await qb.getRawMany();
    const operatingExpenses = rows.reduce((s, r) => s + Number(r.total), 0);
    const [salaries, commissions] = await Promise.all([
      this.sumExpensesBySourceType(companyId, CashMovementSourceType.PAYROLL, dateFrom, dateTo, branchId),
      this.sumExpensesBySourceType(companyId, CashMovementSourceType.COMMISSION_PAYOUT, dateFrom, dateTo, branchId),
    ]);
    const totalExpenses = operatingExpenses + salaries + commissions;
    return {
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      rows: rows.map((r) => ({ label: r.label, total: Number(r.total) })),
      operatingExpenses,
      salaries,
      commissions,
      totalExpenses,
    };
  }

  /**
   * The Operating Expenses / Salaries screens' transaction log: every EXPENSE cash movement of one
   * source type (MANUAL for manually-recorded rent/electricity/etc., PAYROLL for the per-branch
   * rows PayrollService.approve() posts), newest first, with the recording user's name resolved
   * for display. Unlike getExpenseReport() (which aggregates by category for the Reports screen),
   * this returns one row per movement for a page that lists and lets you review each entry.
   */
  async getExpenseTransactions(
    companyId: string,
    dateFrom?: string,
    dateTo?: string,
    sourceType: CashMovementSourceType = CashMovementSourceType.MANUAL,
  ) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('m.id', 'id')
      .addSelect('m."movementDate"', 'date')
      .addSelect('m."documentNumber"', 'documentNumber')
      .addSelect('m.category', 'category')
      .addSelect('m.amount', 'amount')
      .addSelect('m.account', 'account')
      .addSelect('m."branchId"', 'branchId')
      .addSelect('m.description', 'description')
      .addSelect('u."fullName"', 'createdByName')
      .from('cash_movements', 'm')
      .leftJoin('users', 'u', 'u.id = m."createdById"')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere(`m.type = 'EXPENSE'`)
      .andWhere('m."sourceType" = :sourceType', { sourceType })
      .orderBy('m."createdAt"', 'DESC');

    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      documentNumber: r.documentNumber,
      category: r.category,
      amount: Number(r.amount),
      account: r.account,
      branchId: r.branchId,
      description: r.description,
      createdByName: r.createdByName ?? '—',
    }));
  }

  /**
   * "إجمالي العمولات" tab on the Expenses screen (Printing Press only): every branch-manager
   * commission payout (sourceType COMMISSION_PAYOUT) recorded as an EXPENSE, newest-first. Partner
   * dividend payouts (sourceType DIVIDEND) used to appear here too under the tab's old name "أرباح
   * المدراء والشركاء" — dropped by explicit request so this tab's total exactly matches
   * getCommissionPayouts()'s total shown under "مدراء الأفرع والمناديب" ← "إجمالي العمولات"; partner
   * dividends remain visible on their own under "الشركاء". subType/partnerName are kept even though
   * every row is now MANAGER, since nothing else about this shape needed to change.
   */
  async getManagerPartnerProfitTransactions(companyId: string, dateFrom?: string, dateTo?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('m.id', 'id')
      .addSelect('m."movementDate"', 'date')
      .addSelect('m."documentNumber"', 'documentNumber')
      .addSelect('m."sourceType"', 'sourceType')
      .addSelect('m.amount', 'amount')
      .addSelect('m.account', 'account')
      .addSelect('m."branchId"', 'branchId')
      .addSelect('m.description', 'description')
      .addSelect('sr.name', 'managerName')
      .addSelect('p.name', 'partnerName')
      .from('cash_movements', 'm')
      .leftJoin('sales_representatives', 'sr', 'sr.id = m."salesRepresentativeId"')
      .leftJoin('partners', 'p', 'p.id = m."partnerId"')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere(`m.type = 'EXPENSE'`)
      .andWhere(`m."sourceType" = 'COMMISSION_PAYOUT'`)
      .orderBy('m."createdAt"', 'DESC');

    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });

    const rows = await qb.getRawMany();
    const mapped = rows.map((r) => ({
      id: r.id,
      date: r.date,
      documentNumber: r.documentNumber,
      subType: r.sourceType === 'COMMISSION_PAYOUT' ? ('MANAGER' as const) : ('PARTNER' as const),
      name: r.managerName ?? r.partnerName ?? '—',
      amount: Number(r.amount),
      account: r.account,
      branchId: r.branchId,
      description: r.description,
    }));
    return {
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      rows: mapped,
      total: mapped.reduce((sum, r) => sum + r.amount, 0),
    };
  }

  /** Fetches one manually-recorded expense (MANUAL/EXPENSE) row, scoped to its company, or throws. */
  private async getManualExpenseOrFail(companyId: string, id: string): Promise<CashMovement> {
    const row = await this.repo.findOne({
      where: { id, companyId, sourceType: CashMovementSourceType.MANUAL, type: CashMovementType.EXPENSE },
    });
    if (!row) throw new NotFoundException('Expense not found');
    return row;
  }

  /**
   * Edits a manually-recorded expense in place. Balances/totals everywhere (Treasury ledger,
   * Dashboard cash/bank KPIs, expense & profit reports) are computed live from this table, so
   * updating the row here is the entire fix — nothing else needs to be touched.
   */
  async updateManualExpense(
    companyId: string,
    id: string,
    input: {
      movementDate: string;
      account: CashMovementAccount;
      amount: number;
      category: string;
      description?: string | null;
      branchId?: string | null;
      /** Printing Press only (the raw, unresolved branch picked on the edit form) — company-wide
       * (undefined) for every other company, matching the balance the Dashboard/Purchasing screens
       * show. Deliberately NOT `branchId` above, which is attribution-only and for non-Press
       * companies falls back to the editing user's own JWT-cached branch — using that here would
       * silently scope the check to one branch instead of the company's real total. */
      balanceCheckBranchId?: string;
    },
  ): Promise<CashMovement> {
    const row = await this.getManualExpenseOrFail(companyId, id);
    // The row being replaced hasn't been saved/removed yet, so its own old amount is still
    // counted in the balance queried below — add it back only if it was drawn from the same
    // account the edit keeps it on, otherwise the old amount never touched this account's balance.
    const excludeAmount = row.account === input.account ? Number(row.amount) : 0;
    await this.assertSufficientBalance(
      companyId,
      input.account,
      input.amount,
      input.balanceCheckBranchId,
      undefined,
      excludeAmount,
    );

    row.movementDate = input.movementDate;
    row.account = input.account;
    row.amount = input.amount;
    row.category = input.category;
    row.description = input.description ?? null;
    if (input.branchId !== undefined) row.branchId = input.branchId;
    return this.repo.save(row);
  }

  /** Deletes a manually-recorded expense. Same reasoning as updateManualExpense — live SUM queries mean removing the row alone reverses its effect on every balance/total. */
  async deleteManualExpense(companyId: string, id: string): Promise<void> {
    const row = await this.getManualExpenseOrFail(companyId, id);
    await this.repo.remove(row);
  }

  /**
   * Fetches one partner's capital injection, scoped to its company, or throws. Legacy (non-Press)
   * contributions always store the partner-attributed row as BANK, linked via sourceId to its own
   * CASH row that mirrors the same amount into the Bank Balance — that BANK row is what the
   * Partners > Contributions history table displays as one line, so it's the unit edit/delete
   * operates on, with its linked CASH row kept in sync automatically. Printing Press's single-row
   * contributions carry the partner's chosen account (CASH or BANK) directly with no linked twin,
   * so the account is deliberately not filtered on here — id + companyId + sourceType + type
   * already uniquely identify the row either way.
   */
  private async getCapitalInjectionOrFail(companyId: string, id: string): Promise<CashMovement> {
    const row = await this.repo.findOne({
      where: {
        id,
        companyId,
        sourceType: CashMovementSourceType.CAPITAL_INJECTION,
        type: CashMovementType.INCOME,
      },
    });
    if (!row) throw new NotFoundException('Capital injection not found');
    return row;
  }

  /**
   * Edits one partner's contribution row in place. For a legacy double-row entry (sourceId set),
   * the account stays BANK and the partner attribution stays put — only date/amount/description
   * are meant to change, and its linked CASH row (found via sourceId) is updated with the same new
   * values in the same transaction so the Bank Balance stays in lockstep with the Partners'
   * Balance. For a Printing Press single-row entry (no sourceId), the caller may also move the
   * contribution to the other account. Every balance built from this table (partner balances, both
   * KPIs, the Treasury ledger) is a live SUM, so saving the row(s) is the entire fix.
   */
  async updateCapitalInjection(
    companyId: string,
    id: string,
    input: {
      movementDate: string;
      amount: number;
      description?: string | null;
      partnerId?: string;
      account?: CashMovementAccount;
      branchId?: string;
    },
  ): Promise<CashMovement> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CashMovement);
      const row = await repo.findOne({
        where: {
          id,
          companyId,
          sourceType: CashMovementSourceType.CAPITAL_INJECTION,
          type: CashMovementType.INCOME,
        },
      });
      if (!row) throw new NotFoundException('Capital injection not found');

      row.movementDate = input.movementDate;
      row.amount = input.amount;
      row.description = input.description ?? null;
      if (input.partnerId) row.partnerId = input.partnerId;
      if (!row.sourceId && input.account) row.account = input.account;
      if (!row.sourceId && input.branchId !== undefined) row.branchId = input.branchId;
      await repo.save(row);

      if (row.sourceId) {
        const linkedCash = await repo.findOne({ where: { id: row.sourceId, companyId } });
        if (linkedCash) {
          linkedCash.movementDate = input.movementDate;
          linkedCash.amount = input.amount;
          linkedCash.description = input.description ?? null;
          await repo.save(linkedCash);
        }
      }

      return row;
    });
  }

  /** Deletes one partner's contribution row and its linked CASH row (if any) together, so the Bank Balance and Partners' Balance both reverse by the same amount. */
  async deleteCapitalInjection(companyId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CashMovement);
      const row = await repo.findOne({
        where: {
          id,
          companyId,
          sourceType: CashMovementSourceType.CAPITAL_INJECTION,
          type: CashMovementType.INCOME,
        },
      });
      if (!row) throw new NotFoundException('Capital injection not found');

      if (row.sourceId) {
        const linkedCash = await repo.findOne({ where: { id: row.sourceId, companyId } });
        if (linkedCash) await repo.remove(linkedCash);
      }
      await repo.remove(row);
    });
  }

  /**
   * "صرف الأرباح" — pays a Printing Press branch manager's earned commission out of the chosen
   * treasury account. Single row, no linked pair (unlike capital injections' CASH+BANK mirror),
   * since the whole amount really does leave the one account picked — same shape as a dividend
   * payout, just attributed to a manager instead of a partner and with a user-chosen account
   * instead of a hardcoded CASH.
   */
  async createCommissionPayout(
    companyId: string,
    input: {
      movementDate: string;
      amount: number;
      account: CashMovementAccount;
      salesRepresentativeId: string;
      branchId?: string | null;
      description?: string | null;
      createdById: string;
    },
  ): Promise<CashMovement> {
    return this.dataSource.transaction(async (manager) => {
      await this.assertSufficientBalance(companyId, input.account, input.amount, input.branchId, manager);
      return this.record(
        {
          companyId,
          branchId: input.branchId ?? null,
          movementDate: input.movementDate,
          type: CashMovementType.EXPENSE,
          account: input.account,
          amount: input.amount,
          sourceType: CashMovementSourceType.COMMISSION_PAYOUT,
          category: 'Commission Payout',
          salesRepresentativeId: input.salesRepresentativeId,
          description: input.description,
          createdById: input.createdById,
        },
        manager,
      );
    });
  }

  async updateCommissionPayout(
    companyId: string,
    id: string,
    input: { movementDate: string; amount: number; account: CashMovementAccount; description?: string | null },
  ): Promise<CashMovement> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CashMovement);
      const row = await repo.findOne({
        where: { id, companyId, sourceType: CashMovementSourceType.COMMISSION_PAYOUT },
      });
      if (!row) throw new NotFoundException('Commission payout not found');

      // Same-account edits add the row's own old amount back before comparing, so replacing a
      // payout in place never falsely counts itself as an extra draw on the balance; a switch to
      // the other account gets no such credit, since the old amount never left that one.
      const excludeAmount = row.account === input.account ? Number(row.amount) : 0;
      await this.assertSufficientBalance(companyId, input.account, input.amount, row.branchId, manager, excludeAmount);

      row.movementDate = input.movementDate;
      row.amount = input.amount;
      row.account = input.account;
      row.description = input.description ?? null;
      return repo.save(row);
    });
  }

  async deleteCommissionPayout(companyId: string, id: string): Promise<void> {
    const row = await this.repo.findOne({
      where: { id, companyId, sourceType: CashMovementSourceType.COMMISSION_PAYOUT },
    });
    if (!row) throw new NotFoundException('Commission payout not found');
    await this.repo.remove(row);
  }

  /** Commission payout log — "العمولات المصروفة" on the Stationery/Air Conditioning Expenses
   * screen: every commission payout transaction recorded from RepCommissionPayoutPage.tsx,
   * optionally scoped to one beneficiary. Covers BOTH مندوب and مدير فرع payouts — a
   * SalesRepresentative row means one or the other depending solely on whether its linked user
   * holds the "مدير فرع" role (see BRANCH_MANAGER_ROLE_NAME/sales-rep-access.service.ts), never a
   * field on SalesRepresentative itself, so beneficiaryType is resolved via an EXISTS subquery
   * against that user's roles rather than a join (a join to a many-roles user would multiply this
   * row per role instead of yielding one boolean). Also feeds the Stationery Expenses screen's tab
   * (all reps, unscoped), hence the repName join — that tab has no reps list of its own to resolve
   * names from, unlike CommissionPayoutsTab.tsx which already gets managerName from its own
   * branch-commissions query. */
  async getCommissionPayouts(companyId: string, dateFrom?: string, dateTo?: string, salesRepresentativeId?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('m.id', 'id')
      .addSelect('m."movementDate"', 'date')
      .addSelect('m."documentNumber"', 'documentNumber')
      .addSelect('m.amount', 'amount')
      .addSelect('m.account', 'account')
      .addSelect('m."branchId"', 'branchId')
      .addSelect('m."salesRepresentativeId"', 'salesRepresentativeId')
      .addSelect('sr.name', 'repName')
      .addSelect(
        `EXISTS (
           SELECT 1 FROM user_roles ur
           JOIN roles r ON r.id = ur."roleId"
           WHERE ur."userId" = sr."userId" AND r.name = 'مدير فرع'
         )`,
        'isBranchManager',
      )
      .addSelect('m.description', 'description')
      .addSelect('m."createdAt"', 'createdAt')
      .addSelect('u."fullName"', 'createdByName')
      .from('cash_movements', 'm')
      .leftJoin('users', 'u', 'u.id = m."createdById"')
      .leftJoin('sales_representatives', 'sr', 'sr.id = m."salesRepresentativeId"')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere(`m."sourceType" = 'COMMISSION_PAYOUT'`)
      .orderBy('m."createdAt"', 'DESC');

    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });
    if (salesRepresentativeId) qb.andWhere('m."salesRepresentativeId" = :salesRepresentativeId', { salesRepresentativeId });

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      documentNumber: r.documentNumber,
      amount: Number(r.amount),
      account: r.account,
      branchId: r.branchId,
      salesRepresentativeId: r.salesRepresentativeId,
      repName: r.repName ?? '—',
      beneficiaryType: r.isBranchManager ? ('MANAGER' as const) : ('REP' as const),
      description: r.description,
      createdAt: r.createdAt,
      createdByName: r.createdByName ?? '—',
    }));
  }

  /** Printing Press never issues stock for its catalog sales (see SalesInvoicesService.create()),
   * so sales_invoices.costOfGoodsSold is always 0 there — a sales-based COGS figure is meaningless
   * for a press. Its real "cost of goods sold" is what it spent buying raw materials (paper, ink,
   * ...) in the period, i.e. the same total already shown on the Expenses screen's "إجمالي
   * مشتريات المواد الخام" tab (see ExpensesPage.tsx) — reused here instead of recomputed.
   * `branchId` (Printing Press only) narrows this to one branch's own purchases, via the branch
   * chosen on the Purchase Invoice form (PurchaseReceipt.branchId). */
  private async getRawMaterialPurchasesTotal(
    companyId: string,
    dateFrom: string,
    dateTo: string,
    branchId?: string,
  ): Promise<number> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(r."totalAmount"), 0)', 'total')
      .from('purchase_receipts', 'r')
      .where('r."companyId" = :companyId', { companyId })
      .andWhere('r."receiptDate" >= :dateFrom', { dateFrom })
      .andWhere('r."receiptDate" <= :dateTo', { dateTo });
    if (branchId) qb.andWhere('r."branchId" = :branchId', { branchId });
    const row = await qb.getRawOne();
    return Number(row?.total ?? 0);
  }

  /**
   * Printing Performance Report's "إجمالي المواد المستهلكة" card and material-consumption ratio —
   * summed straight from approved Monthly Stock Audits (see StockAuditsService), the same
   * `(systemQuantity - finalQuantity) * unitCost` per line the Stock Audit screen itself shows as
   * "إجمالي المستهلك" (see StockAuditsService.findAll()'s totalConsumedValue). Only APPROVED
   * audits count — a still-pending (CONFIRMED) audit hasn't actually adjusted stock yet, so its
   * figures are only a preview, not real consumption. A line left uncounted
   * (`actualQuantity IS NULL`) contributes nothing. `branchId` (Printing Press only) narrows this
   * to one branch via the audit's warehouse — the same Warehouse.branchId link the Stock Audit
   * screen's own branch column/filter already uses. Returns 0 (never null/NaN) when no matching
   * audit exists for the period/branch.
   */
  private async getConsumedMaterialsTotal(
    companyId: string,
    dateFrom: string,
    dateTo: string,
    branchId?: string,
  ): Promise<number> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select(
        `COALESCE(SUM((l."systemQuantity" - COALESCE(l."adjustedQuantity", l."actualQuantity")) * l."unitCost"), 0)`,
        'total',
      )
      .from('stock_audit_lines', 'l')
      .innerJoin('stock_audits', 'a', 'a.id = l."auditId"')
      .innerJoin('warehouses', 'w', 'w.id = a."warehouseId"')
      .where('a."companyId" = :companyId', { companyId })
      .andWhere(`a.status = 'APPROVED'`)
      .andWhere('l."actualQuantity" IS NOT NULL')
      .andWhere('a."auditDate" >= :dateFrom', { dateFrom })
      .andWhere('a."auditDate" <= :dateTo', { dateTo });
    if (branchId) qb.andWhere('w."branchId" = :branchId', { branchId });
    const row = await qb.getRawOne();
    return Number(row?.total ?? 0);
  }

  /**
   * Profit report: Sales revenue - COGS - operating expenses - salaries - commissions = Net profit.
   *
   * Revenue is cash-basis — SUM(sales_invoices."amountPaid"), not the full invoiced total — so it
   * always matches the Sales Report screen's "إجمالي المبلغ المدفوع" card exactly (that card sums
   * each invoice's own amountPaid, prorated per line; since lines always sum back to the invoice's
   * grandTotal, the two totals telescope to the same figure for the same invoiceDate/branch
   * filter). An invoice that's fully or partially outstanding contributes only what's actually been
   * collected on it so far, not its full invoiced value — deliberately, per the same reasoning
   * outstandingCustomerBalances (DashboardService) already tracks uncollected AR separately rather
   * than counting it as earned revenue.
   *
   * For every company except Printing Press, COGS comes from sales_invoices (see
   * getRawMaterialPurchasesTotal for why Press is different). Net profit deliberately stays
   * dividend-agnostic (dividends are a distribution OF profit, not a cost incurred to earn it) —
   * this is exactly the figure the Partners/Dividends screen validates a payout against, so it can
   * never be circular. `expenseBreakdown` is a separate, purely informational rollup for the
   * Reports screen's Expense Report tab: COGS + operating expenses + salaries + commissions —
   * dividends are deliberately excluded, since a profit distribution is not an expense. Salaries
   * and commissions were previously excluded from both totalExpenses/netProfit and this breakdown
   * (commissions weren't counted at all; salaries were silently merged into "operating expenses"
   * under getExpenseReport's old combined MANUAL+PAYROLL query) — both are real costs, so folding
   * them in here also makes netProfit (and therefore max available dividends) correctly smaller by
   * exactly what's actually been paid out in salaries/commissions, not a display-only change.
   *
   * `branchId` (Printing Press only — the Financial Reports screen's Branch filter) narrows all
   * three figures to one branch: Revenue via the invoice's own branchId column (set directly on
   * every invoice at creation — see SalesInvoicesService.create()'s resolveBranchId() call — not
   * via a join through its optional salesRepresentativeId, which a Press invoice frequently has no
   * value for at all and would silently zero out revenue for a branch that filter is applied to),
   * COGS via PurchaseReceipt.branchId (set on the Purchase Invoice form), and operating
   * expenses/salaries/commissions via CashMovement.branchId (set on the Treasury Expenses /
   * commission-payout forms). Omitted/undefined means every branch combined — identical to today's
   * behavior.
   */
  /** AC only — "الإيرادات غير المدفوعة" ÷ "الأقساط" component: every uncollected جنيه (principal +
   * interest) still owed across every ACTIVE installment plan's schedule. Mirrors
   * InstallmentPlansService.getSummary() exactly — duplicated here rather than injecting that
   * service to avoid a cross-module dependency for one read-only aggregate (sales↔treasury already
   * has enough one-way coupling as it is). */
  private async getInstallmentOutstanding(companyId: string): Promise<number> {
    const dueRow = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(si."amountDue"), 0)', 'totalDue')
      .from('installment_schedule_items', 'si')
      .innerJoin('installment_plans', 'p', 'p.id = si."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere(`p.status = 'ACTIVE'`)
      .getRawOne();
    const paidRow = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(ip.amount), 0)', 'totalPaid')
      .from('installment_payments', 'ip')
      .innerJoin('installment_plans', 'p', 'p.id = ip."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere(`p.status = 'ACTIVE'`)
      .andWhere('ip."scheduleItemId" IS NOT NULL')
      .getRawOne();
    return Number(dueRow?.totalDue ?? 0) - Number(paidRow?.totalPaid ?? 0);
  }

  /** AC only — "الإيرادات غير المدفوعة" ÷ "الأرصدة المستحقة" component: every unpaid sales invoice
   * balance as of `asOfDate`. Mirrors CustomersService.getOutstandingTotal() exactly — same
   * cross-module-avoidance reasoning as getInstallmentOutstanding above. Never overlaps with that
   * installment figure: installment plans have their own separate schedule/payment tables, never
   * touching sales_invoices/sales_payments at all. */
  private async getOutstandingCustomerBalance(companyId: string, asOfDate: string): Promise<number> {
    const [invoiceTotal, paymentTotal] = await Promise.all([
      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(SUM(i."grandTotal"), 0)', 'total')
        .from('sales_invoices', 'i')
        .where('i."companyId" = :companyId', { companyId })
        .andWhere("i.status != 'CANCELLED'")
        .andWhere('i."invoiceDate" <= :asOfDate', { asOfDate })
        .getRawOne(),
      this.dataSource
        .createQueryBuilder()
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .from('sales_payments', 'p')
        .where('p."companyId" = :companyId', { companyId })
        .andWhere('p."paymentDate" <= :asOfDate', { asOfDate })
        .getRawOne(),
    ]);
    return Number(invoiceTotal?.total ?? 0) - Number(paymentTotal?.total ?? 0);
  }

  /** AC only — "البونص" row: every AcSupplierBonus row recorded within [dateFrom, dateTo], across
   * every supplier (companyId-only filter — see AcSupplierBonusesService.findAll's own optional
   * supplierId param). A bonus never touches Cash/Bank, so this has no cash_movements counterpart
   * to reconcile against — it's a pure supplier-ledger read. */
  private async getBonusTotal(companyId: string, dateFrom: string, dateTo: string): Promise<number> {
    const [{ total }] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ac_supplier_bonuses
       WHERE "companyId" = $1 AND "bonusDate" >= $2 AND "bonusDate" <= $3`,
      [companyId, dateFrom, dateTo],
    );
    return Number(total);
  }

  async getProfitReport(companyId: string, dateFrom: string, dateTo: string, branchId?: string) {
    const salesQb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(i."amountPaid"), 0)', 'revenue')
      .addSelect('COALESCE(SUM(i."costOfGoodsSold"), 0)', 'cogs')
      .from('sales_invoices', 'i')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere('i."invoiceDate" >= :dateFrom', { dateFrom })
      .andWhere('i."invoiceDate" <= :dateTo', { dateTo });
    if (branchId) salesQb.andWhere('i."branchId" = :branchId', { branchId });
    const salesRow = await salesQb.getRawOne();

    const {
      totalExpenses,
      rows: expenseRows,
      operatingExpenses,
      salaries,
      commissions,
    } = await this.getExpenseReport(companyId, dateFrom, dateTo, branchId);
    const distributedDividends = await this.getDistributedDividendsTotal(companyId, dateFrom, dateTo, undefined, branchId);

    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    const isPress = company?.code === PRINTING_PRESS_COMPANY_CODE;
    const isAirConditioning = company?.code === 'AC';
    const revenue = Number(salesRow?.revenue ?? 0);
    const cogs = isPress
      ? await this.getRawMaterialPurchasesTotal(companyId, dateFrom, dateTo, branchId)
      : Number(salesRow?.cogs ?? 0);
    const consumedMaterials = isPress ? await this.getConsumedMaterialsTotal(companyId, dateFrom, dateTo, branchId) : 0;
    const grossProfit = revenue - cogs;
    const netProfit = grossProfit - totalExpenses;

    // AC only — "تقرير الأرباح"'s الإيرادات المدفوعة/غير المدفوعة/البونص split. unpaidRevenue is a
    // point-in-time snapshot (installment/customer balances outstanding as of dateTo) rather than a
    // period flow like revenue itself — there's no "became outstanding during this period" tracking
    // in this codebase, so "as of the report's end date" is the closest honest reading. bonusTotal
    // IS period-scoped like revenue, since AcSupplierBonus rows carry their own real bonusDate.
    // netProfit above stays exactly the existing cash-only figure — the "شامل"/"نقدي" toggle these
    // feed lives entirely client-side in ReportsPage.tsx, computed from these raw building blocks.
    const unpaidRevenue = isAirConditioning
      ? (await this.getInstallmentOutstanding(companyId)) + (await this.getOutstandingCustomerBalance(companyId, dateTo))
      : 0;
    const bonusTotal = isAirConditioning ? await this.getBonusTotal(companyId, dateFrom, dateTo) : 0;

    return {
      dateFrom,
      dateTo,
      revenue,
      cogs,
      consumedMaterials,
      grossProfit,
      expenses: expenseRows,
      totalExpenses,
      netProfit,
      unpaidRevenue,
      bonusTotal,
      distributedDividends,
      expenseBreakdown: {
        cogs,
        operatingExpenses,
        salaries,
        commissions,
        total: cogs + totalExpenses,
      },
    };
  }

  /**
   * Financial Reports' "الفرع" scope selector (AC / STAT / الكل) — Administrator-only, so an owner
   * who oversees both companies can view either one's profit report, or the two combined, from a
   * single screen without switching their active-company session. `scope` is optional and defaults
   * to exactly today's behavior (report for the caller's own active company) when omitted, so every
   * existing caller — including Printing Press, which never sends this param — is unaffected.
   * Authorization happens here, not in the controller: even a client that crafts the query param by
   * hand can never reach another company's figures unless `user.allCompanies` (i.e. they're a true
   * Administrator) is actually true.
   */
  async getProfitReportScoped(
    user: AuthenticatedUser,
    dateFrom: string,
    dateTo: string,
    branchId?: string,
    scope?: 'AC' | 'STAT' | 'ALL',
  ) {
    if (!scope) return this.getProfitReport(user.companyId!, dateFrom, dateTo, branchId);
    if (!user.allCompanies) {
      throw new ForbiddenException('Only an Administrator may view another company\'s financial report');
    }

    const companies = await this.companiesRepo.find({ where: { code: In(['AC', 'STAT']) } });
    const acId = companies.find((c) => c.code === 'AC')?.id;
    const statId = companies.find((c) => c.code === 'STAT')?.id;
    if (!acId || !statId) throw new NotFoundException('AC/STAT company not found');

    if (scope === 'AC') return this.getProfitReport(acId, dateFrom, dateTo, branchId);
    if (scope === 'STAT') return this.getProfitReport(statId, dateFrom, dateTo, branchId);

    const [acReport, statReport] = await Promise.all([
      this.getProfitReport(acId, dateFrom, dateTo, branchId),
      this.getProfitReport(statId, dateFrom, dateTo, branchId),
    ]);
    return this.mergeProfitReports(acReport, statReport);
  }

  private mergeProfitReports(
    a: Awaited<ReturnType<CashMovementsService['getProfitReport']>>,
    b: Awaited<ReturnType<CashMovementsService['getProfitReport']>>,
  ): Awaited<ReturnType<CashMovementsService['getProfitReport']>> {
    const expenseByLabel = new Map<string, number>();
    for (const row of [...a.expenses, ...b.expenses]) {
      expenseByLabel.set(row.label, (expenseByLabel.get(row.label) ?? 0) + row.total);
    }
    return {
      dateFrom: a.dateFrom,
      dateTo: a.dateTo,
      revenue: a.revenue + b.revenue,
      cogs: a.cogs + b.cogs,
      consumedMaterials: a.consumedMaterials + b.consumedMaterials,
      grossProfit: a.grossProfit + b.grossProfit,
      expenses: Array.from(expenseByLabel, ([label, total]) => ({ label, total })),
      totalExpenses: a.totalExpenses + b.totalExpenses,
      netProfit: a.netProfit + b.netProfit,
      // Only ever non-zero on the AC side (STAT computes both as 0 — see getProfitReport) — summing
      // is harmless and keeps a combined "ALL" scope report internally consistent either way.
      unpaidRevenue: a.unpaidRevenue + b.unpaidRevenue,
      bonusTotal: a.bonusTotal + b.bonusTotal,
      distributedDividends: a.distributedDividends + b.distributedDividends,
      expenseBreakdown: {
        cogs: a.expenseBreakdown.cogs + b.expenseBreakdown.cogs,
        operatingExpenses: a.expenseBreakdown.operatingExpenses + b.expenseBreakdown.operatingExpenses,
        salaries: a.expenseBreakdown.salaries + b.expenseBreakdown.salaries,
        commissions: a.expenseBreakdown.commissions + b.expenseBreakdown.commissions,
        total: a.expenseBreakdown.total + b.expenseBreakdown.total,
      },
    };
  }

  /** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31. Mirrors
   * partners-treasury.controller.ts's exported quarterDateRange() — duplicated as a private
   * method here rather than imported, since that file imports CashMovementsService itself and an
   * import the other way would create a circular dependency between the two. */
  private quarterDateRange(year: number, quarter: number): { dateFrom: string; dateTo: string } {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const lastDay = new Date(year, endMonth, 0).getDate();
    return {
      dateFrom: `${year}-${String(startMonth).padStart(2, '0')}-01`,
      dateTo: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  /** The year the company actually started operating, for the Printing Performance Report's trend
   * chart below — mirrors SalesRepresentativesService.getEarliestActivityYear() exactly (same
   * reasoning: company-wide, not report-specific, so it can't flicker based on the branch filter). */
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
   * Printing Performance Report's trend chart: net profit and material-consumption ratio (approved
   * Monthly Stock Audits' consumed materials ÷ revenue — see getConsumedMaterialsTotal()) per
   * quarter. Same period set as SalesRepresentativesService's getQuarterlyTrend() — this quarter's
   * own same-year quarters, the same quarter the prior two years, and the immediately preceding
   * quarter — and the same "never show a year before the company's first activity" guard via
   * getEarliestActivityYear(). Every period's figures come straight from getProfitReport(), so this
   * chart can never disagree with the Profit Report tab for the same period.
   */
  async getPrintingPerformanceTrend(companyId: string, year: number, quarter: number, branchId?: string) {
    if (quarter < 1 || quarter > 4) return { periods: [], earliestYear: year };

    const earliestYear = await this.getEarliestActivityYear(companyId);

    const periods: { year: number; quarter: number }[] = [];
    const addPeriod = (y: number, q: number) => {
      if (y < earliestYear) return;
      if (!periods.some((p) => p.year === y && p.quarter === q)) periods.push({ year: y, quarter: q });
    };
    // Always the full 4 quarters of the selected year — not just up to the currently-selected
    // quarter — so the chart's X-axis stays a complete, continuous year (a not-yet-reached quarter
    // simply has no invoices yet, so its own getProfitReport() call naturally returns 0).
    for (let q = 1; q <= 4; q++) addPeriod(year, q);
    addPeriod(year - 1, quarter);
    addPeriod(year - 2, quarter);
    addPeriod(quarter > 1 ? year : year - 1, quarter > 1 ? quarter - 1 : 4);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const results = await Promise.all(
      periods.map(async (p) => {
        const { dateFrom, dateTo } = this.quarterDateRange(p.year, p.quarter);
        const report = await this.getProfitReport(companyId, dateFrom, dateTo, branchId);
        const materialCostRatio = report.revenue > 0 ? (report.consumedMaterials / report.revenue) * 100 : 0;
        return { year: p.year, quarter: p.quarter, netProfit: round2(report.netProfit), materialCostRatio: round2(materialCostRatio) };
      }),
    );
    return { periods: results, earliestYear };
  }

  /**
   * COGS detail records for the unified Expenses screen's "تكلفة البضاعة المباعة" tab — one row
   * per sales invoice in the period, each carrying the cost snapshot already stored on it
   * (SalesInvoicesService sets `costOfGoodsSold` at invoice creation from the weighted-average
   * stock cost of every line). No separate calculation happens here — this just lists what
   * getProfitReport()'s `cogs` total is actually made of.
   */
  async getCogsTransactions(companyId: string, dateFrom?: string, dateTo?: string) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('i.id', 'id')
      .addSelect('i."invoiceDate"', 'date')
      .addSelect('i."documentNumber"', 'documentNumber')
      .addSelect('c.name', 'customerName')
      .addSelect('i."costOfGoodsSold"', 'cogs')
      .from('sales_invoices', 'i')
      .leftJoin('customers', 'c', 'c.id = i."customerId"')
      .where('i."companyId" = :companyId', { companyId })
      .orderBy('i."createdAt"', 'DESC');

    if (dateFrom) qb.andWhere('i."invoiceDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('i."invoiceDate" <= :dateTo', { dateTo });

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      documentNumber: r.documentNumber,
      customerName: r.customerName ?? '—',
      cogs: Number(r.cogs),
    }));
  }

  /** Sum of dividend payouts (sourceType DIVIDEND) recorded within a date range — used both for the Reports breakdown and to cap how much more a quarter can still distribute. */
  /**
   * Company-wide dividend total for the period, or one partner's slice of it when `partnerId` is
   * given. `branchId` (Printing Press only) further narrows to payouts drawn from one branch — a
   * branch-owned partner's distribution history must never include another branch's payouts.
   */
  async getDistributedDividendsTotal(
    companyId: string,
    dateFrom: string,
    dateTo: string,
    partnerId?: string,
    branchId?: string,
  ): Promise<number> {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(m.amount), 0)', 'total')
      .from('cash_movements', 'm')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere(`m."sourceType" = 'DIVIDEND'`)
      .andWhere('m."movementDate" >= :dateFrom', { dateFrom })
      .andWhere('m."movementDate" <= :dateTo', { dateTo });
    if (partnerId) qb.andWhere('m."partnerId" = :partnerId', { partnerId });
    if (branchId) qb.andWhere('m."branchId" = :branchId', { branchId });
    const row = await qb.getRawOne();
    return Number(row?.total ?? 0);
  }

  /** Capital injections log for the Partners > Contributions screen — optionally scoped to one contributing partner. */
  async getCapitalInjections(companyId: string, dateFrom?: string, dateTo?: string, partnerId?: string) {
    return this.getManualTransactionsBySourceType(companyId, 'CAPITAL_INJECTION', dateFrom, dateTo, partnerId);
  }

  /** Dividend payouts log for the Partners > Dividends screen — optionally scoped to one partner's share of each payout. */
  async getDividendTransactions(companyId: string, dateFrom?: string, dateTo?: string, partnerId?: string) {
    return this.getManualTransactionsBySourceType(companyId, 'DIVIDEND', dateFrom, dateTo, partnerId);
  }

  private async getManualTransactionsBySourceType(
    companyId: string,
    sourceType: 'CAPITAL_INJECTION' | 'DIVIDEND',
    dateFrom?: string,
    dateTo?: string,
    partnerId?: string,
  ) {
    const qb = this.dataSource
      .createQueryBuilder()
      .select('m.id', 'id')
      .addSelect('m."movementDate"', 'date')
      .addSelect('m."documentNumber"', 'documentNumber')
      .addSelect('m.amount', 'amount')
      .addSelect('m.account', 'account')
      .addSelect('m."branchId"', 'branchId')
      .addSelect('m.description', 'description')
      .addSelect('m."partnerId"', 'partnerId')
      .addSelect('p.name', 'partnerName')
      .addSelect('u."fullName"', 'createdByName')
      .from('cash_movements', 'm')
      .leftJoin('users', 'u', 'u.id = m."createdById"')
      .leftJoin('partners', 'p', 'p.id = m."partnerId"')
      .where('m."companyId" = :companyId', { companyId })
      .andWhere('m."sourceType" = :sourceType', { sourceType })
      .orderBy('m."createdAt"', 'DESC');

    if (dateFrom) qb.andWhere('m."movementDate" >= :dateFrom', { dateFrom });
    if (dateTo) qb.andWhere('m."movementDate" <= :dateTo', { dateTo });
    if (partnerId) qb.andWhere('m."partnerId" = :partnerId', { partnerId });
    // Each capital injection also creates a linked, unattributed CASH row mirroring the amount
    // into the Bank Balance (see createCapitalInjection) — exclude it here so the Contributions
    // history shows only the one partner-attributed line per share, not a duplicate.
    if (sourceType === 'CAPITAL_INJECTION') qb.andWhere('m."partnerId" IS NOT NULL');

    const rows = await qb.getRawMany();
    return rows.map((r) => ({
      id: r.id,
      date: r.date,
      documentNumber: r.documentNumber,
      amount: Number(r.amount),
      account: r.account,
      branchId: r.branchId,
      description: r.description,
      partnerId: r.partnerId,
      partnerName: r.partnerName ?? '—',
      createdByName: r.createdByName ?? '—',
    }));
  }
}
