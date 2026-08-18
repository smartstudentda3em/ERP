import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { Customer } from './entities/customer.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { SalesInvoice } from '../../sales/sales-invoices/entities/sales-invoice.entity';

export interface StatementLine {
  date: string;
  type: 'OPENING_BALANCE' | 'INVOICE' | 'PAYMENT';
  documentNumber: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

@Injectable()
export class CustomersService extends BaseCrudService<Customer> {
  constructor(
    @InjectRepository(Customer) repo: Repository<Customer>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {
    super(repo);
  }

  /** Scoped to the caller's company — an id that belongs to another company 404s exactly like an id that doesn't exist at all, so ids can't be probed cross-company. */
  async findOneScoped(id: string, companyId: string): Promise<Customer> {
    const customer = await super.findOne(id);
    if (customer.companyId !== companyId) throw new NotFoundException('Customer not found');
    return customer;
  }

  async createForCompany(dto: CreateCustomerDto, companyId: string): Promise<Customer> {
    let code = dto.code;
    if (code) {
      const existing = await this.repo.findOne({ where: { companyId, code } });
      if (existing) throw new ConflictException('Customer code already exists');
    } else {
      code = (await this.numberingSeriesService.tryGetNextNumber(companyId, 'CUSTOMER')) ?? `CUST-${Date.now()}`;
    }
    return super.create({ ...dto, companyId, code } as any);
  }

  async updateScoped(id: string, companyId: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.findOneScoped(id, companyId);
    Object.assign(customer, dto);
    return this.repo.save(customer);
  }

  async removeScoped(id: string, companyId: string): Promise<void> {
    const customer = await this.findOneScoped(id, companyId);
    await this.repo.remove(customer);
  }

  /**
   * Total purchases is always derived live from sales_invoices rather than stored on the customer
   * row — a stored/cached total would need a trigger (or equivalent) to stay in sync on every
   * invoice write, and any missed path (a manual DB fix, a future bulk-import, a bugfix that skips
   * the hook) silently leaves it stale, exactly like the "شركة سمارت" bug this replaces. Computing
   * it from the real ledger on every read means there is no stale value to ever go wrong.
   */
  async findAllForCompany(
    companyId: string,
  ): Promise<
    (Customer & {
      totalPurchases: number;
      totalPaid: number;
      balanceDue: number;
      salesRepresentativeName: string | null;
    })[]
  > {
    const customers = await super.findAll({ companyId } as FindOptionsWhere<Customer>);
    if (customers.length === 0) return [];

    const ids = customers.map((c) => c.id);
    const assignedRepIds = [...new Set(customers.map((c) => c.salesRepresentativeId).filter(Boolean))] as string[];

    const [invoiceTotals, paymentTotals, assignedReps, invoiceReps, invoiceCreators] = await Promise.all([
      this.dataSource
        .createQueryBuilder()
        .select('i."customerId"', 'customerId')
        .addSelect('COALESCE(SUM(i."grandTotal"), 0)', 'total')
        .from('sales_invoices', 'i')
        .where('i."customerId" IN (:...ids)', { ids })
        .groupBy('i."customerId"')
        .getRawMany(),
      this.dataSource
        .createQueryBuilder()
        .select('p."customerId"', 'customerId')
        .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
        .from('sales_payments', 'p')
        .where('p."customerId" IN (:...ids)', { ids })
        .groupBy('p."customerId"')
        .getRawMany(),
      assignedRepIds.length
        ? this.dataSource
            .createQueryBuilder()
            .select('r.id', 'id')
            .addSelect('r.name', 'name')
            .from('sales_representatives', 'r')
            .where('r.id IN (:...assignedRepIds)', { assignedRepIds })
            .getRawMany()
        : Promise.resolve([]),
      // Fallback source: the sales rep recorded on the customer's most recent invoice, used
      // whenever the customer has no directly-assigned rep of their own.
      this.dataSource
        .createQueryBuilder()
        .select('i."customerId"', 'customerId')
        .addSelect('r.name', 'repName')
        .from('sales_invoices', 'i')
        .innerJoin('sales_representatives', 'r', 'r.id = i."salesRepresentativeId"')
        .where('i."customerId" IN (:...ids)', { ids })
        .distinctOn(['i."customerId"'])
        .orderBy('i."customerId"')
        .addOrderBy('i."invoiceDate"', 'DESC')
        .getRawMany(),
      // Final fallback: the employee who created the customer's most recent invoice, used when
      // that invoice has no sales rep attached at all (e.g. an admin recorded it directly) — so
      // the column never falls back to an empty dash just because no rep was ever chosen.
      this.dataSource
        .createQueryBuilder()
        .select('i."customerId"', 'customerId')
        .addSelect('u."fullName"', 'creatorName')
        .from('sales_invoices', 'i')
        .innerJoin('users', 'u', 'u.id = i."createdById"')
        .where('i."customerId" IN (:...ids)', { ids })
        .distinctOn(['i."customerId"'])
        .orderBy('i."customerId"')
        .addOrderBy('i."invoiceDate"', 'DESC')
        .getRawMany(),
    ]);

    const totalPurchasesByCustomerId = new Map(invoiceTotals.map((t) => [t.customerId, Number(t.total)]));
    const totalPaidByCustomerId = new Map(paymentTotals.map((t) => [t.customerId, Number(t.total)]));
    const assignedRepNameById = new Map(assignedReps.map((r) => [r.id, r.name]));
    const invoiceRepNameByCustomerId = new Map(invoiceReps.map((r) => [r.customerId, r.repName]));
    const invoiceCreatorNameByCustomerId = new Map(invoiceCreators.map((r) => [r.customerId, r.creatorName]));

    return customers.map((c) => {
      const totalPurchases = totalPurchasesByCustomerId.get(c.id) ?? 0;
      const totalPaid = totalPaidByCustomerId.get(c.id) ?? 0;
      const salesRepresentativeName =
        (c.salesRepresentativeId ? assignedRepNameById.get(c.salesRepresentativeId) : null) ??
        invoiceRepNameByCustomerId.get(c.id) ??
        invoiceCreatorNameByCustomerId.get(c.id) ??
        null;
      return {
        ...c,
        totalPurchases,
        totalPaid,
        balanceDue: Number(c.openingBalance) + totalPurchases - totalPaid,
        salesRepresentativeName,
      };
    });
  }

  /**
   * `sales_invoices.amountPaid` is a running total maintained by SalesPaymentsService as each
   * receipt is recorded — normally correct, but a stored/cached number like that has no way to
   * self-heal if it's ever missed (a payment recorded through a different path, a manual DB fix,
   * a bug in an increment step). Every screen that shows an invoice's paid/remaining amount
   * (this drill-down modal, the Outstanding Balance detail screen) sums the ACTUAL linked
   * sales_payments rows instead — the same "compute live from the ledger" rule findAll() already
   * applies for the customer-level totals above, now applied per-invoice too, so the two can never
   * disagree with each other or with reality.
   */
  private async loadCustomerInvoices(customerId: string) {
    const invoices = await this.dataSource.getRepository(SalesInvoice).find({
      where: { customerId },
      relations: ['lines', 'lines.product', 'salesRepresentative'],
      order: { invoiceDate: 'DESC' },
    });
    if (invoices.length === 0) return [];

    const customer = await this.dataSource
      .getRepository(Customer)
      .findOne({ where: { id: customerId }, relations: ['salesRepresentative'] });

    // Final fallback for invoices with neither their own rep nor a customer-level one — the
    // employee who actually entered the invoice (e.g. an admin recording a walk-in sale), so this
    // column never falls back to an empty dash just because no rep was ever chosen. Mirrors the
    // same third-level fallback findAllForCompany() already applies at the customer-list level.
    const createdByIds = [...new Set(invoices.map((inv) => inv.createdById).filter(Boolean))];
    const creators = createdByIds.length
      ? await this.dataSource
          .createQueryBuilder()
          .select('u.id', 'id')
          .addSelect('u."fullName"', 'fullName')
          .from('users', 'u')
          .where('u.id IN (:...createdByIds)', { createdByIds })
          .getRawMany()
      : [];
    const creatorNameById = new Map(creators.map((c) => [c.id, c.fullName]));

    const invoiceIds = invoices.map((inv) => inv.id);
    const paidRows = await this.dataSource
      .createQueryBuilder()
      .select('p."invoiceId"', 'invoiceId')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
      .from('sales_payments', 'p')
      .where('p."invoiceId" IN (:...invoiceIds)', { invoiceIds })
      .groupBy('p."invoiceId"')
      .getRawMany();
    const directAmountByInvoiceId = new Map(paidRows.map((r) => [r.invoiceId, Number(r.total)]));

    // Payments recorded against the customer but not tied to any specific invoice (a "دفعة تحت
    // الحساب" / on-account receipt) still reduce what the customer actually owes overall, so
    // they're applied here against the customer's oldest open invoices first (FIFO) until
    // exhausted — otherwise sum(remainingAmount) across invoices would overstate the true balance
    // by exactly the total of these on-account receipts, disagreeing with
    // invoiceTotal - paymentTotal (see getOutstandingTotal() below, which uses that subtraction).
    const { total: freeCreditRaw } = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .from('sales_payments', 'p')
      .where('p."customerId" = :customerId', { customerId })
      .andWhere('p."invoiceId" IS NULL')
      .getRawOne();
    let freeCredit = Number(freeCreditRaw ?? 0);

    const appliedFreeCreditByInvoiceId = new Map<string, number>();
    const oldestFirst = [...invoices].sort((a, b) =>
      a.invoiceDate < b.invoiceDate ? -1 : a.invoiceDate > b.invoiceDate ? 1 : 0,
    );
    for (const inv of oldestFirst) {
      if (freeCredit <= 0.005) break;
      const openAmount = Number(inv.grandTotal) - (directAmountByInvoiceId.get(inv.id) ?? 0);
      if (openAmount <= 0.005) continue;
      const applied = Math.min(openAmount, freeCredit);
      appliedFreeCreditByInvoiceId.set(inv.id, applied);
      freeCredit -= applied;
    }

    return invoices.map((inv) => {
      const amountPaid =
        (directAmountByInvoiceId.get(inv.id) ?? 0) + (appliedFreeCreditByInvoiceId.get(inv.id) ?? 0);
      return {
        id: inv.id,
        documentNumber: inv.documentNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        grandTotal: Number(inv.grandTotal),
        amountPaid,
        remainingAmount: Number(inv.grandTotal) - amountPaid,
        salesRepresentativeName:
          inv.salesRepresentative?.name ??
          customer?.salesRepresentative?.name ??
          creatorNameById.get(inv.createdById) ??
          null,
        lines: (inv.lines ?? []).map((l: any) => ({
          productName: l.product?.nameEn ?? '—',
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          lineTotal: Number(l.lineTotal),
        })),
      };
    });
  }

  /**
   * Every invoice with an outstanding balance (grandTotal > amountPaid) — the Outstanding Balance
   * detail screen only ever shows still-open debt, not closed history: fully paid invoices are
   * excluded here rather than filtered client-side, so the totals above the table (and the
   * print/PDF output, which renders the exact same data) can never disagree with what's listed.
   */
  async getOutstandingInvoices(customerId: string, companyId: string) {
    await this.findOneScoped(customerId, companyId);
    const invoices = await this.loadCustomerInvoices(customerId);
    return invoices.filter((inv) => inv.grandTotal - inv.amountPaid > 0.005);
  }

  /** Every invoice for the customer regardless of payment status (paid, partially paid, or
   * unpaid) — backs the Outstanding Balance detail screen's invoices table, which shows the full
   * history rather than only still-open debt. */
  async getAllInvoices(customerId: string, companyId: string) {
    await this.findOneScoped(customerId, companyId);
    return this.loadCustomerInvoices(customerId);
  }

  /**
   * Total outstanding customer balance as it stood at the end of a given period — every invoice
   * dated on or before `asOfDate` minus every payment dated on or before `asOfDate`, live-summed
   * from the actual ledger (not the cached invoice.amountPaid) for the same reason findAll() and
   * loadCustomerInvoices() do. Backs the Partners > Dividends screen's "الأرصدة المستحقة" card,
   * which needs the balance as of the selected quarter/year, not today's live figure.
   */
  async getOutstandingTotal(companyId: string, asOfDate: string): Promise<number> {
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

  /** Statement of account: opening balance + invoices (debit) + payments (credit), running balance. */
  async getStatement(customerId: string, companyId: string, dateFrom?: string, dateTo?: string) {
    const customer = await this.findOneScoped(customerId, companyId);

    const invoices = await this.dataSource
      .createQueryBuilder()
      .select('i."invoiceDate"', 'date')
      .addSelect('i."documentNumber"', 'documentNumber')
      .addSelect('i."grandTotal"', 'amount')
      .from('sales_invoices', 'i')
      .where('i."customerId" = :customerId', { customerId })
      .andWhere(dateFrom ? 'i."invoiceDate" >= :dateFrom' : '1=1', { dateFrom })
      .andWhere(dateTo ? 'i."invoiceDate" <= :dateTo' : '1=1', { dateTo })
      .getRawMany();

    const payments = await this.dataSource
      .createQueryBuilder()
      .select('p."paymentDate"', 'date')
      .addSelect('p."documentNumber"', 'documentNumber')
      .addSelect('p.amount', 'amount')
      .from('sales_payments', 'p')
      .where('p."customerId" = :customerId', { customerId })
      .andWhere(dateFrom ? 'p."paymentDate" >= :dateFrom' : '1=1', { dateFrom })
      .andWhere(dateTo ? 'p."paymentDate" <= :dateTo' : '1=1', { dateTo })
      .getRawMany();

    const movements = [
      ...invoices.map((i) => ({
        date: i.date,
        type: 'INVOICE' as const,
        documentNumber: i.documentNumber,
        debit: Number(i.amount),
        credit: 0,
      })),
      ...payments.map((p) => ({
        date: p.date,
        type: 'PAYMENT' as const,
        documentNumber: p.documentNumber,
        debit: 0,
        credit: Number(p.amount),
      })),
    ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let runningBalance = Number(customer.openingBalance);
    const lines: StatementLine[] = [
      {
        date: dateFrom ?? '—',
        type: 'OPENING_BALANCE',
        documentNumber: '—',
        debit: 0,
        credit: 0,
        runningBalance,
      },
    ];
    for (const movement of movements) {
      runningBalance += movement.debit - movement.credit;
      lines.push({ ...movement, runningBalance });
    }

    return {
      customer: { id: customer.id, code: customer.code, name: customer.name },
      openingBalance: Number(customer.openingBalance),
      closingBalance: runningBalance,
      lines,
    };
  }
}
