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
import { rethrowFriendlyDbError } from '../../../common/services/base-crud.service';
import { CashMovement } from '../../treasury/entities/cash-movement.entity';
import { Product } from '../../inventory/products/entities/product.entity';
import { Company } from '../../settings/entities/company.entity';
import { Customer } from '../../parties/customers/entities/customer.entity';
import { SalesRepAccessService } from '../../../common/services/sales-rep-access.service';
import { User } from '../../users/entities/user.entity';
import { UserCompany } from '../../users/entities/user-company.entity';
import { SalesRepresentative } from '../../parties/entities/sales-representative.entity';
import { CommissionException } from '../../parties/entities/commission-exception.entity';
import { buildExceptionsByRepId, resolveLineCommissionRate } from '../../parties/commission-rate.util';
import { assertPaymentAccountProvided } from '../../../common/utils/payment-account.util';
import { findOrCreateQuickCustomer } from '../../parties/customers/customer-quick-entry.util';

@Injectable()
export class SalesInvoicesService {
  constructor(
    @InjectRepository(SalesInvoice) private readonly repo: Repository<SalesInvoice>,
    @InjectRepository(SalesPayment) private readonly paymentRepo: Repository<SalesPayment>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(UserCompany) private readonly userCompanyRepo: Repository<UserCompany>,
    @InjectRepository(SalesRepresentative) private readonly salesRepRepo: Repository<SalesRepresentative>,
    @InjectRepository(CommissionException) private readonly commissionExceptionsRepo: Repository<CommissionException>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly stockService: StockService,
    private readonly cashMovementsService: CashMovementsService,
    private readonly salesRepAccess: SalesRepAccessService,
  ) {}

  /** Resolves each invoice's `createdById` to the user's display name — a plain audit column, not
   * a relation, so this is a raw lookup rather than an ORM join. Branch-scoped exactly like
   * getSalesLines()/resolveBranchId(): a non-admin pinned to a branch (via their own linked
   * SalesRepresentative) only ever sees that branch's invoices.
   *
   * A "مندوب" caller is additionally pinned to ONLY their own invoices (salesRepresentativeId must
   * match their own linked rep) — unlike "مدير فرع", a مندوب has no concept of "my branch's sales"
   * at all, only "my own sales" (see SalesRepAccessService.isCallerSalesRep's doc comment on why a
   * مندوب has no branch concept the way مدير فرع does). If a مندوب somehow has no linked rep row
   * (shouldn't happen — auto-provisioned at user creation), they see nothing rather than everyone
   * else's invoices by accident.
   *
   * `isBranchManagerSelf` additionally hides any invoice that earns this caller zero commission —
   * exclusively for the "مدير فرع" role (re-derived from the DB via
   * SalesRepAccessService.isCallerBranchManager, never for Administrator or the broader "Manager"
   * role). Uses the exact same resolveLineCommissionRate() a line's rate is computed with in the
   * Branch Managers Commission report / "أدائي" dashboard (sales-representatives.controller.ts), so
   * "0% commission" can never mean something different on this screen than it does there. An
   * invoice with no lines at all (shouldn't happen, but never crashes on it) counts as
   * zero-commission and is hidden too. */
  async findAll(companyId: string, userId: string) {
    const branchId = await this.salesRepAccess.resolveBranchId(userId, undefined, companyId);
    const isSalesRep = await this.salesRepAccess.isCallerSalesRep(userId);
    let ownRepId: string | null = null;
    if (isSalesRep) {
      const ownRep = await this.salesRepRepo.findOne({ where: { userId, companyId } });
      ownRepId = ownRep?.id ?? null;
    }

    let invoices =
      isSalesRep && !ownRepId
        ? []
        : await this.repo.find({
            where: {
              companyId,
              ...(branchId ? { branchId } : {}),
              ...(isSalesRep ? { salesRepresentativeId: ownRepId! } : {}),
            },
            relations: ['customer', 'warehouse', 'salesRepresentative', 'branch'],
            order: { createdAt: 'DESC' },
          });

    const isBranchManagerSelf = await this.salesRepAccess.isCallerBranchManager(userId);
    if (isBranchManagerSelf && invoices.length) {
      const ownRep = await this.salesRepRepo.findOne({ where: { userId, companyId } });
      if (ownRep) {
        const generalRate = Number(ownRep.commissionRate ?? 0);
        const exceptionRows = await this.commissionExceptionsRepo.find({
          where: { companyId, salesRepresentativeId: ownRep.id },
        });
        const exceptions = buildExceptionsByRepId(exceptionRows).get(ownRep.id);

        const lineRows = await this.dataSource
          .createQueryBuilder()
          .select('l."invoiceId"', 'invoiceId')
          .addSelect('l."productId"', 'productId')
          .addSelect('p."categoryId"', 'categoryId')
          .from('sales_invoice_lines', 'l')
          .innerJoin('products', 'p', 'p.id = l."productId"')
          .where('l."invoiceId" IN (:...invoiceIds)', { invoiceIds: invoices.map((i) => i.id) })
          .getRawMany();
        const linesByInvoiceId = new Map<string, typeof lineRows>();
        for (const line of lineRows) {
          if (!linesByInvoiceId.has(line.invoiceId)) linesByInvoiceId.set(line.invoiceId, []);
          linesByInvoiceId.get(line.invoiceId)!.push(line);
        }

        invoices = invoices.filter((inv) => {
          const lines = linesByInvoiceId.get(inv.id) ?? [];
          return lines.some((line) => resolveLineCommissionRate(line, exceptions, generalRate) > 0);
        });
      }
    }

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
   *
   * Excludes any user who already has a SalesRepresentative row for this company — the frontend
   * lists this method's results alongside GET /sales-representatives in the same dropdown, and a
   * "مندوب" account's own SalesRepresentative row is auto-created with their exact display name
   * (see UsersService.syncRepRepresentative) at account creation. Without this exclusion, that one
   * person appeared twice in the merged dropdown under two different value keys (rep:<repId> vs
   * user:<userId>) — not a rare edge case, but the guaranteed outcome for every مندوب account.
   */
  async getAssignableUsers(companyId: string) {
    const users = await this.userRepo.find({ where: { isActive: true }, relations: ['roles'] });
    if (!users.length) return [];
    const links = await this.userCompanyRepo.find({ where: { userId: In(users.map((u) => u.id)) } });
    const companyIdsByUser = new Map<string, string[]>();
    for (const link of links) {
      companyIdsByUser.set(link.userId, [...(companyIdsByUser.get(link.userId) ?? []), link.companyId]);
    }
    const repUserIds = new Set(
      (await this.salesRepRepo.find({ where: { companyId } }))
        .map((r) => r.userId)
        .filter((id): id is string => !!id),
    );
    return users
      .filter(
        (u) =>
          !repUserIds.has(u.id) &&
          ((u.roles?.some((r) => r.isSystemRole) ?? false) ||
            (companyIdsByUser.get(u.id) ?? []).includes(companyId)),
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
    const company = await this.companyRepo.findOne({ where: { id: companyId } });

    // A customerId belonging to another company must never be accepted — otherwise this invoice's
    // balance/statement would silently pollute a customer record the caller has no business
    // touching. 404s (not 400s) so a client can't distinguish "doesn't exist" from "exists in
    // another company", matching the findOneScoped convention used everywhere else in this codebase.
    //
    // Air Conditioning's quick-entry flow (typed Name/Phone instead of picking an existing
    // customer) omits customerId entirely — resolved to a real Customer row inside the transaction
    // below instead (see findOrCreateQuickCustomer), so a later failure (e.g. insufficient stock)
    // rolls that customer creation back too. Every other company must still send a real
    // customerId; gated here rather than in the DTO since the rule depends on the company.
    if (dto.customerId) {
      const customer = await this.customerRepo.findOne({ where: { id: dto.customerId, companyId } });
      if (!customer) throw new NotFoundException('Customer not found');
    } else if (company?.code !== 'AC') {
      throw new BadRequestException('customerId is required');
    } else if (!dto.customerName || !dto.customerPhone) {
      throw new BadRequestException('Customer name and phone are required');
    }

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

    const warnOnSellBelowCost = company?.warnOnSellBelowCost ?? true;
    const canSellBelowCost = userPermissions.includes('sales.invoice.sellBelowCost');
    const isRepTreasurySale = await this.salesRepAccess.isSalesAgentRep(salesRepresentativeId);
    if (!isRepTreasurySale) {
      assertPaymentAccountProvided(company?.code, dto.paymentAccount);
    }

    return this.dataSource.transaction(async (manager) => {
      const resolvedCustomerId = dto.customerId
        ? dto.customerId
        : (
            await findOrCreateQuickCustomer(manager, this.numberingSeriesService, companyId, {
              name: dto.customerName!,
              phone: dto.customerPhone!,
              address: dto.customerAddress,
            })
          ).id;

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

        // Catalog items (Printing Press "المنتجات") and services (Air Conditioning "الخدمات") are
        // finished/manufactured products or pure labor with no real stock tracking — only raw
        // materials (default RAW_MATERIAL, whether flagged "قابلة للبيع" or not) ever move real
        // warehouse stock, so this skips issuance for them entirely rather than failing on their
        // permanently-empty StockLevel.
        let unitCost = 0;
        let totalCost = 0;
        if (product?.productType !== ProductType.CATALOG_ITEM && product?.productType !== ProductType.SERVICE) {
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
        customerId: resolvedCustomerId,
        salesOrderId: dto.salesOrderId ?? null,
        warehouseId: dto.warehouseId,
        companyId,
        branchId,
        salesRepresentativeId,
        status: SalesDocumentStatus.CONFIRMED,
        notes: dto.notes ?? null,
        // Printing Press alone keeps these — it always sends a shared walk-in customerId AND typed
        // name/phone, decoupled from the Customer table on purpose. Every AC quick-entry sale
        // (cash or credit) is attributed to a real resolved Customer row instead (see
        // resolvedCustomerId above), whose own name/mobile/address already carry the identity, so
        // these stay null there rather than duplicating (and risking drifting from) what the
        // Customer row says.
        customerName: dto.customerId ? dto.customerName ?? null : null,
        customerPhone: dto.customerId ? dto.customerPhone ?? null : null,
        customerAddress: dto.customerId ? dto.customerAddress ?? null : null,
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
            account: isRepTreasurySale ? CashMovementAccount.REP_TREASURY : dto.paymentAccount ?? CashMovementAccount.CASH,
            // Only set for a مندوب's own sale — REP_TREASURY is a per-rep pocket, so every
            // movement tagged with that account must carry whose pocket it belongs to.
            salesRepresentativeId: isRepTreasurySale ? salesRepresentativeId : undefined,
            amount: paidAmount,
            sourceType: CashMovementSourceType.SALES_INVOICE,
            sourceId: finalInvoice.id,
            partyCustomerId: resolvedCustomerId,
            description: `Payment ${paymentDocumentNumber}`,
            createdById,
          },
          manager,
        );

        const payment = manager.getRepository(SalesPayment).create({
          documentNumber: paymentDocumentNumber,
          paymentDate: dto.invoiceDate,
          customerId: resolvedCustomerId,
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

    // Same cross-company guard as create() — an edit must never be able to re-point an existing
    // invoice at another company's customer.
    const customer = await this.customerRepo.findOne({ where: { id: dto.customerId, companyId } });
    if (!customer) throw new NotFoundException('Customer not found');

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
   *
   * No application-level check for a linked SalesReturn — that entity's `invoiceId` FK is
   * `onDelete: "RESTRICT"`, so an invoice with a return already recorded against it is blocked at
   * the DB layer; the try/catch below just turns that into a clear message instead of a raw 500.
   */
  async remove(id: string, deletedById: string, companyId: string): Promise<void> {
    const invoice = await this.repo.findOne({ where: { id, companyId }, relations: ['lines'] });
    if (!invoice) throw new NotFoundException('Sales invoice not found');

    try {
      await this.dataSource.transaction(async (manager) => {
      const products = await manager
        .getRepository(Product)
        .find({ where: { id: In(invoice.lines.map((l) => l.productId)) } });
      const productTypeById = new Map(products.map((p) => [p.id, p.productType]));

      for (const line of invoice.lines) {
        // Mirrors create()'s skip: catalog items and services never had stock issued in the first
        // place, so there is nothing to receive back for them.
        const lineProductType = productTypeById.get(line.productId);
        if (lineProductType === ProductType.CATALOG_ITEM || lineProductType === ProductType.SERVICE) continue;
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
    } catch (err) {
      rethrowFriendlyDbError(err);
    }
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
   *
   * A "مندوب" caller is additionally pinned to only their own sales lines (salesRepresentativeId
   * must match their own linked rep) — mirrors the identical restriction already applied in
   * findAll() for the invoices list, for the same reason: a مندوب has no "my branch's sales"
   * concept, only "my own sales" (see SalesRepAccessService.isCallerSalesRep's doc comment).
   */
  async getSalesLines(companyId: string, userId: string, dateFrom?: string, dateTo?: string, branchId?: string) {
    const effectiveBranchId = await this.salesRepAccess.resolveBranchId(userId, branchId, companyId);
    const isSalesRep = await this.salesRepAccess.isCallerSalesRep(userId);
    let ownRepId: string | null = null;
    if (isSalesRep) {
      const ownRep = await this.salesRepRepo.findOne({ where: { userId, companyId } });
      ownRepId = ownRep?.id ?? null;
      if (!ownRepId) return [];
    }
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
      .andWhere(ownRepId ? 'i."salesRepresentativeId" = :ownRepId' : '1=1', { ownRepId })
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
