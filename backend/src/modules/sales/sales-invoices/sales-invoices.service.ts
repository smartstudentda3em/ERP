import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { SalesInvoice, SalesInvoiceLine } from './entities/sales-invoice.entity';
import { SalesPayment } from '../sales-payments/entities/sales-payment.entity';
import { CreateSalesInvoiceDto, UpdateSalesInvoiceDto } from './dto/sales-invoice.dto';
import { computeDocumentTotals, computeLine } from '../../../common/utils/pricing';
import {
  SalesDocumentStatus,
  SaleUnitKind,
  PaymentMethod,
  CashMovementType,
  CashMovementAccount,
  CashMovementSourceType,
  StockMovementType,
  ProductType,
} from '../../../entities/enums';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { StockService } from '../../inventory/stock-movements/stock.service';
import { CashMovementsService } from '../../treasury/cash-movements.service';
import { CashMovement } from '../../treasury/entities/cash-movement.entity';
import { Product } from '../../inventory/products/entities/product.entity';
import { Company } from '../../settings/entities/company.entity';
import { SalesRepAccessService } from '../../../common/services/sales-rep-access.service';
import { User } from '../../users/entities/user.entity';
import { UserCompany } from '../../users/entities/user-company.entity';

@Injectable()
export class SalesInvoicesService {
  constructor(
    @InjectRepository(SalesInvoice) private readonly repo: Repository<SalesInvoice>,
    @InjectRepository(SalesPayment) private readonly paymentRepo: Repository<SalesPayment>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserCompany) private readonly userCompanyRepo: Repository<UserCompany>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly stockService: StockService,
    private readonly cashMovementsService: CashMovementsService,
    private readonly salesRepAccess: SalesRepAccessService,
  ) {}

  /** Resolves each invoice's `createdById` to the user's display name — a plain audit column, not
   * a relation, so this is a raw lookup rather than an ORM join. Branch-scoped exactly like
   * getSalesLines()/resolveBranchId(): a non-admin pinned to a branch (via their own linked
   * SalesRepresentative) only ever sees that branch's invoices. */
  async findAll(companyId: string, userId: string) {
    const branchId = await this.salesRepAccess.resolveBranchId(userId, undefined, companyId);
    const invoices = await this.repo.find({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      relations: ['customer', 'warehouse', 'salesRepresentative', 'branch'],
      order: { createdAt: 'DESC' },
    });
    const userRows = await this.dataSource
      .createQueryBuilder()
      .select('u.id', 'id')
      .addSelect('u."fullName"', 'fullName')
      .from('users', 'u')
      .getRawMany();
    const nameById = new Map<string, string>(userRows.map((u) => [u.id, u.fullName]));
    return invoices.map((inv) => ({ ...inv, createdByName: nameById.get(inv.createdById) ?? '—' }));
  }

  /**
   * Active users, for the invoice form's "attributed to" field — id + display name only.
   * Scoped exactly like UsersService.findAllForCompany(): Administrators (isSystemRole) are
   * visible from every company context; everyone else only appears where they hold a
   * UserCompany row for the caller's active company — this is what previously let a user from an
   * unrelated company (e.g. التكييفات) leak into another company's assignee dropdown.
   */
  async getAssignableUsers(companyId: string) {
    const users = await this.userRepo.find({ where: { isActive: true }, relations: ['roles'] });
    if (!users.length) return [];
    const links = await this.userCompanyRepo.find({ where: { userId: In(users.map((u) => u.id)) } });
    const companyIdsByUser = new Map<string, string[]>();
    for (const link of links) {
      companyIdsByUser.set(link.userId, [...(companyIdsByUser.get(link.userId) ?? []), link.companyId]);
    }
    return users
      .filter(
        (u) =>
          (u.roles?.some((r) => r.isSystemRole) ?? false) ||
          (companyIdsByUser.get(u.id) ?? []).includes(companyId),
      )
      .map((u) => ({ id: u.id, fullName: u.fullName }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async findOne(id: string, companyId: string): Promise<SalesInvoice> {
    const invoice = await this.repo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.product', 'lines.product.unit', 'lines.product.packageType', 'customer', 'warehouse'],
    });
    if (!invoice) throw new NotFoundException('Sales invoice not found');
    return invoice;
  }

  /**
   * Creates the invoice and issues stock at weighted-average cost (for COGS) inside one DB
   * transaction, so a failure at any step (e.g. insufficient stock) rolls back the whole invoice
   * instead of leaving partial state. A credit sale never touches the treasury — only the
   * customer's balance (computed live from this invoice's grandTotal vs amountPaid) changes; an
   * upfront payment records an actual CashMovement, same as a payment made later.
   */
  async create(
    dto: CreateSalesInvoiceDto,
    callerId: string,
    companyId: string,
    userPermissions: string[] = [],
  ): Promise<SalesInvoice> {
    // Non-admins can never attribute an invoice to anyone but themselves — the client-submitted
    // salesRepresentativeId/createdById is ignored outright for them. See SalesRepAccessService.
    const { salesRepresentativeId, createdById } = await this.salesRepAccess.resolveInvoiceOwner(
      callerId,
      { salesRepresentativeId: dto.salesRepresentativeId, createdById: dto.createdById },
      companyId,
    );
    // A non-admin can never attribute an invoice to a branch other than their own — mirrors the
    // rep/owner override above.
    const branchId = await this.salesRepAccess.resolveBranchId(callerId, dto.branchId, companyId);

    // Sales invoices carry no discount/tax — line totals are simply quantity × unit price.
    const linesNoDiscountOrTax = dto.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    }));
    const totals = computeDocumentTotals(linesNoDiscountOrTax);
    const documentNumber = await this.numberingSeriesService.getNextNumber(companyId, 'SALES_INVOICE');

    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    const warnOnSellBelowCost = company?.warnOnSellBelowCost ?? true;
    const canSellBelowCost = userPermissions.includes('sales.invoice.sellBelowCost');

    return this.dataSource.transaction(async (manager) => {
      let costOfGoodsSold = 0;
      let totalProfit = 0;
      const lines: SalesInvoiceLine[] = [];

      for (const [i, line] of dto.lines.entries()) {
        const computed = computeLine(linesNoDiscountOrTax[i]);
        const unitKind = line.unitKind ?? SaleUnitKind.UNIT;

        const product = await manager.getRepository(Product).findOne({ where: { id: line.productId, companyId } });
        const unitsPerPackage = product?.unitsPerPackage ? Number(product.unitsPerPackage) : null;

        if (unitKind === SaleUnitKind.PACKAGE && !unitsPerPackage) {
          throw new BadRequestException(
            `"${product?.nameEn ?? line.productId}" has no package size configured — cannot sell by package.`,
          );
        }
        const baseQuantity = unitKind === SaleUnitKind.PACKAGE ? Number(line.quantity) * unitsPerPackage! : Number(line.quantity);

        // Catalog items (Printing Press "المنتجات") are finished/manufactured products with no
        // real stock tracking — only raw materials (default RAW_MATERIAL, whether flagged
        // "قابلة للبيع" or not) ever move real warehouse stock, so this skips issuance for them
        // entirely rather than failing on their permanently-empty StockLevel.
        let unitCost = 0;
        let totalCost = 0;
        if (product?.productType !== ProductType.CATALOG_ITEM) {
          const issued = await this.stockService.issue(
            {
              companyId,
              productId: line.productId,
              warehouseId: dto.warehouseId,
              quantity: baseQuantity,
              referenceType: 'SALES_INVOICE',
              referenceNumber: documentNumber,
              createdById,
            },
            undefined,
            manager,
          );
          unitCost = issued.unitCost;
          totalCost = issued.totalCost;
        }
        costOfGoodsSold += totalCost;

        const purchasePrice =
          unitKind === SaleUnitKind.PACKAGE
            ? Number(product?.packagePurchasePrice ?? Number(product?.purchasePrice ?? 0) * (unitsPerPackage ?? 1))
            : Number(product?.purchasePrice ?? 0);
        const suggestedPrice =
          unitKind === SaleUnitKind.PACKAGE
            ? Number(product?.packageSellingPrice ?? Number(product?.sellingPrice ?? 0) * (unitsPerPackage ?? 1))
            : Number(product?.sellingPrice ?? 0);
        const profitPerUnit = Number(line.unitPrice) - purchasePrice;
        const lineTotalProfit = profitPerUnit * Number(line.quantity);

        if (profitPerUnit < 0 && warnOnSellBelowCost && !canSellBelowCost) {
          throw new ForbiddenException(
            `Selling "${product?.nameEn ?? line.productId}" below its purchase cost (${purchasePrice.toFixed(2)}) requires the "sell below cost" permission.`,
          );
        }

        totalProfit += lineTotalProfit;

        lines.push(
          Object.assign(new SalesInvoiceLine(), {
            productId: line.productId,
            unitKind,
            quantity: line.quantity,
            baseQuantity,
            unitPrice: line.unitPrice,
            lineTotal: computed.lineTotal,
            unitCost,
            purchasePrice,
            suggestedPrice,
            profitPerUnit,
            totalProfit: lineTotalProfit,
          }),
        );
      }

      const invoice = manager.getRepository(SalesInvoice).create({
        documentNumber,
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate ?? null,
        customerId: dto.customerId,
        salesOrderId: dto.salesOrderId ?? null,
        warehouseId: dto.warehouseId,
        companyId,
        branchId,
        salesRepresentativeId,
        status: SalesDocumentStatus.CONFIRMED,
        notes: dto.notes ?? null,
        customerName: dto.customerName ?? null,
        customerPhone: dto.customerPhone ?? null,
        paymentAccount: dto.paymentAccount ?? null,
        createdById,
        costOfGoodsSold,
        totalProfit,
        subtotal: totals.subtotal,
        grandTotal: totals.grandTotal,
        lines,
      });
      const finalInvoice = await manager.getRepository(SalesInvoice).save(invoice);

      // An upfront payment at invoice creation is just the payment flow composed atomically with
      // invoice creation: it records an actual CashMovement and a SalesPayment row, exactly like a
      // payment recorded after the fact via SalesPaymentsService. Any amount beyond the invoice
      // total still leaves the customer's balance in credit — no separate "customer credit"
      // concept needed, since the customer's balance is always grandTotal minus amountPaid.
      const paidAmount = Number(dto.paidAmount ?? 0);
      if (paidAmount > 0) {
        const paymentDocumentNumber = await this.numberingSeriesService.getNextNumber(companyId, 'SALES_PAYMENT');

        const movement = await this.cashMovementsService.record(
          {
            companyId,
            branchId: dto.branchId,
            movementDate: dto.invoiceDate,
            type: CashMovementType.INCOME,
            account: dto.paymentAccount ?? CashMovementAccount.CASH,
            amount: paidAmount,
            sourceType: CashMovementSourceType.SALES_INVOICE,
            sourceId: finalInvoice.id,
            partyCustomerId: dto.customerId,
            description: `Payment ${paymentDocumentNumber}`,
            createdById,
          },
          manager,
        );

        const payment = manager.getRepository(SalesPayment).create({
          documentNumber: paymentDocumentNumber,
          paymentDate: dto.invoiceDate,
          customerId: dto.customerId,
          companyId,
          branchId: dto.branchId ?? null,
          invoiceId: finalInvoice.id,
          method: PaymentMethod.CASH,
          amount: paidAmount,
          createdById,
          cashMovementId: movement.id,
        });
        await manager.getRepository(SalesPayment).save(payment);

        finalInvoice.amountPaid = paidAmount;
        finalInvoice.status =
          paidAmount >= Number(finalInvoice.grandTotal)
            ? SalesDocumentStatus.PAID
            : SalesDocumentStatus.PARTIALLY_PAID;
        return manager.getRepository(SalesInvoice).save(finalInvoice);
      }

      return finalInvoice;
    });
  }

  /**
   * Edits only the fields with no stock/COGS/payment impact (date, customer, sales rep/owner,
   * notes) — see UpdateSalesInvoiceDto for why the warehouse and line items are never touched
   * here. Non-admins can never reassign the rep/owner to anyone but themselves, same as create()
   * — see SalesRepAccessService.
   */
  async update(id: string, dto: UpdateSalesInvoiceDto, callerId: string, companyId: string): Promise<SalesInvoice> {
    const invoice = await this.repo.findOne({ where: { id, companyId } });
    if (!invoice) throw new NotFoundException('Sales invoice not found');
    const { salesRepresentativeId, createdById } = await this.salesRepAccess.resolveInvoiceOwner(
      callerId,
      { salesRepresentativeId: dto.salesRepresentativeId, createdById: dto.createdById },
      companyId,
    );
    invoice.invoiceDate = dto.invoiceDate;
    invoice.customerId = dto.customerId;
    invoice.salesRepresentativeId = salesRepresentativeId;
    invoice.createdById = createdById;
    invoice.notes = dto.notes ?? null;
    invoice.customerName = dto.customerName ?? null;
    invoice.customerPhone = dto.customerPhone ?? null;
    return this.repo.save(invoice);
  }

  /**
   * Fully reverses and deletes an invoice inside one transaction: every line's stock is received
   * back at the exact cost it was issued at (restoring the weighted-average cost to what it was
   * before), any payment recorded against it and its linked CashMovement are removed, then the
   * invoice itself (its lines cascade at the DB level).
   */
  async remove(id: string, deletedById: string, companyId: string): Promise<void> {
    const invoice = await this.repo.findOne({ where: { id, companyId }, relations: ['lines'] });
    if (!invoice) throw new NotFoundException('Sales invoice not found');

    await this.dataSource.transaction(async (manager) => {
      const products = await manager
        .getRepository(Product)
        .find({ where: { id: In(invoice.lines.map((l) => l.productId)) } });
      const productTypeById = new Map(products.map((p) => [p.id, p.productType]));

      for (const line of invoice.lines) {
        // Mirrors create()'s skip: catalog items never had stock issued in the first place, so
        // there is nothing to receive back for them.
        if (productTypeById.get(line.productId) === ProductType.CATALOG_ITEM) continue;
        await this.stockService.receive(
          {
            companyId,
            productId: line.productId,
            warehouseId: invoice.warehouseId,
            quantity: Number(line.baseQuantity),
            unitCost: Number(line.unitCost),
            referenceType: 'SALES_INVOICE_DELETE',
            referenceId: invoice.id,
            referenceNumber: invoice.documentNumber,
            createdById: deletedById,
          },
          StockMovementType.SALES_RETURN,
          manager,
        );
      }

      const payments = await manager.getRepository(SalesPayment).find({ where: { invoiceId: invoice.id } });
      for (const payment of payments) {
        if (payment.cashMovementId) {
          await manager.getRepository(CashMovement).delete(payment.cashMovementId);
        }
      }
      if (payments.length) await manager.getRepository(SalesPayment).remove(payments);

      await manager.getRepository(SalesInvoice).remove(invoice);
    });
  }

  /**
   * Flattened sales-line report backing the "المبيعات" screen: one row per sold line item, with
   * the rep recorded on its invoice and the quantity expressed in packages (via baseQuantity /
   * unitsPerPackage) — the same package-first convention PackageQuantity uses everywhere else in
   * the UI. `branchId` filters to one branch via the invoice's own branchId column — the actual
   * branch a Press sale was made under, set directly at invoice creation via a branch selector.
   * Filtering via the invoice's sales rep's branchId (as this used to) silently dropped every
   * Press invoice with no salesRepresentativeId, which is most of them, since Press invoicing
   * never asks for a rep — see SalesInvoicesPage's branch selector replacing the rep selector.
   * Non-admin callers always have it re-pinned to their own rep's branch by SalesRepAccessService,
   * regardless of what they requested.
   */
  async getSalesLines(companyId: string, userId: string, dateFrom?: string, dateTo?: string, branchId?: string) {
    const effectiveBranchId = await this.salesRepAccess.resolveBranchId(userId, branchId, companyId);
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('l.id', 'id')
      .addSelect('i."invoiceDate"', 'invoiceDate')
      .addSelect('p."nameEn"', 'productName')
      .addSelect('p."productType"', 'productType')
      .addSelect('l."baseQuantity"', 'baseQuantity')
      .addSelect('p."unitsPerPackage"', 'unitsPerPackage')
      .addSelect('pt."nameEn"', 'packageTypeName')
      .addSelect('r.name', 'salesRepresentativeName')
      .addSelect('COALESCE(br."nameAr", br."nameEn")', 'branchName')
      .addSelect('c.name', 'customerName')
      .addSelect('l."lineTotal"', 'lineTotal')
      .addSelect('l."totalProfit"', 'totalProfit')
      .addSelect('l."unitCost"', 'unitCost')
      .addSelect('i."grandTotal"', 'invoiceGrandTotal')
      .addSelect('i."amountPaid"', 'invoiceAmountPaid')
      .from('sales_invoice_lines', 'l')
      .innerJoin('sales_invoices', 'i', 'i.id = l."invoiceId"')
      .innerJoin('products', 'p', 'p.id = l."productId"')
      .leftJoin('package_types', 'pt', 'pt.id = p."packageTypeId"')
      .leftJoin('sales_representatives', 'r', 'r.id = i."salesRepresentativeId"')
      .leftJoin('branches', 'br', 'br.id = i."branchId"')
      .leftJoin('customers', 'c', 'c.id = i."customerId"')
      .where('i."companyId" = :companyId', { companyId })
      .andWhere(dateFrom ? 'i."invoiceDate" >= :dateFrom' : '1=1', { dateFrom })
      .andWhere(dateTo ? 'i."invoiceDate" <= :dateTo' : '1=1', { dateTo })
      .andWhere(effectiveBranchId ? 'i."branchId" = :effectiveBranchId' : '1=1', { effectiveBranchId })
      .orderBy('i."createdAt"', 'DESC')
      .getRawMany();

    return rows.map((r) => {
      const lineTotal = Number(r.lineTotal);
      const invoiceGrandTotal = Number(r.invoiceGrandTotal);
      const invoiceAmountPaid = Number(r.invoiceAmountPaid);
      // Payments are recorded against the invoice as a whole, never per line, so a line's own
      // paid/due split is a proration: its share of the invoice total times how much of the
      // invoice has actually been paid.
      const paidAmount = invoiceGrandTotal > 0 ? (lineTotal / invoiceGrandTotal) * invoiceAmountPaid : 0;
      const dueAmount = lineTotal - paidAmount;
      // The actual weighted-average stock cost at time of sale (unitCost), not the product's
      // catalog purchasePrice — this is what reconciles with the invoice's own costOfGoodsSold
      // total and the Profit Report elsewhere in the app.
      const costOfGoodsSold = Number(r.unitCost) * Number(r.baseQuantity);
      return {
        id: r.id,
        invoiceDate: r.invoiceDate,
        productName: r.productName,
        productType: r.productType,
        baseQuantity: Number(r.baseQuantity),
        unitsPerPackage: r.unitsPerPackage != null ? Number(r.unitsPerPackage) : null,
        packageTypeName: r.packageTypeName ?? null,
        salesRepresentativeName: r.salesRepresentativeName ?? null,
        branchName: r.branchName ?? null,
        customerName: r.customerName ?? null,
        lineTotal,
        costOfGoodsSold,
        totalProfit: Number(r.totalProfit),
        paidAmount,
        dueAmount,
      };
    });
  }
}
