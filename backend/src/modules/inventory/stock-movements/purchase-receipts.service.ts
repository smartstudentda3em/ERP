import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PurchaseReceipt } from './entities/purchase-receipt.entity';
import { StockService } from './stock.service';
import { CashMovementAccount, CashMovementSourceType, CashMovementType, StockMovementType } from '../../../entities/enums';
import { CreatePurchaseReceiptDto, UpdatePurchaseReceiptDto } from './dto/stock.dto';
import { Product } from '../products/entities/product.entity';
import { Warehouse } from '../../settings/entities/warehouse.entity';
import { Supplier } from '../../parties/suppliers/entities/supplier.entity';
import { Company } from '../../settings/entities/company.entity';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { CashMovementsService } from '../../treasury/cash-movements.service';
import { CashMovement } from '../../treasury/entities/cash-movement.entity';
import { AcSupplierPaymentsService } from '../../ac-supplier-ledger/ac-supplier-payments.service';
import { SupplierPayment } from '../../parties/suppliers/entities/supplier-payment.entity';

/** The 3 payment sources a receipt's paid-now amount can come from — null means fully on credit
 * (paidAmount is 0, or the receipt predates any of this). See attachPaymentSources. */
type PaymentSource = CashMovementAccount | 'SUPPLIER_BALANCE' | null;

const PAYMENT_SOURCE_LABELS_AR: Record<Exclude<PaymentSource, null>, string> = {
  [CashMovementAccount.CASH]: 'الخزينة النقدي',
  [CashMovementAccount.BANK]: 'البنك',
  [CashMovementAccount.REP_TREASURY]: 'خزينة المندوب',
  SUPPLIER_BALANCE: 'رصيد المورد',
};

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    @InjectRepository(PurchaseReceipt) private readonly repo: Repository<PurchaseReceipt>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly cashMovementsService: CashMovementsService,
    private readonly acSupplierPaymentsService: AcSupplierPaymentsService,
  ) {}

  /** Air Conditioning company only — "رصيد المورد" as the paid-now payment source: skips the
   * treasury (CashMovementsService) entirely and instead consumes the supplier's own standalone
   * "دفعات المورد" balance (see AcSupplierPaymentsService.deductForPurchase). Rejects the flag
   * outright for any other company, mirroring assertFreeGoodsAllowed's pattern. */
  private async assertSupplierBalancePaymentAllowed(companyId: string, dto: { paidFromSupplierBalance?: boolean }): Promise<void> {
    if (!dto.paidFromSupplierBalance) return;
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    if (company?.code !== 'AC') {
      throw new BadRequestException('Paying from supplier balance is only supported for the Air Conditioning company');
    }
  }

  /** Air Conditioning company only — a supplier's in-kind/target-discount goods enter stock at
   * their real quantity but must carry zero financial value, so they never affect what's owed to
   * the supplier. Rejects the field outright for any other company, and rejects a nonzero
   * packagePurchasePrice/paidAmount whenever it's set — this is a hard financial guarantee, not a
   * default, so it's enforced by rejection rather than silently overwritten. */
  private async assertFreeGoodsAllowed(
    companyId: string,
    dto: { isFreeGoods?: boolean; packagePurchasePrice: number; paidAmount?: number },
  ): Promise<void> {
    if (!dto.isFreeGoods) return;
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    if (company?.code !== 'AC') {
      throw new BadRequestException('Free goods receipts are only supported for the Air Conditioning company');
    }
    if (dto.packagePurchasePrice !== 0) {
      throw new BadRequestException('A free goods receipt must have a package purchase price of exactly 0');
    }
    if (dto.paidAmount) {
      throw new BadRequestException('A free goods receipt cannot have a paid amount');
    }
  }

  /**
   * Which treasury account (or "رصيد المورد") each of these receipts' paid-now amount actually
   * came from — null for a receipt with nothing paid (or predating this field's existence).
   * Neither PurchaseReceipt nor its DTOs persist a paymentAccount column directly; it's always
   * derived from whichever side-record exists (a linked CashMovement, or an AcSupplierPayment
   * deduction row) — this is what lets the Purchasing edit form correctly pre-select the real
   * current source instead of defaulting to CASH regardless of how the receipt was actually paid.
   */
  private async attachPaymentSources<T extends PurchaseReceipt>(
    receipts: T[],
    companyId: string,
    manager?: EntityManager,
  ): Promise<(T & { paymentSource: PaymentSource })[]> {
    if (receipts.length === 0) return [];
    const ids = receipts.map((r) => r.id);
    const cashMovementRepo = manager ? manager.getRepository(CashMovement) : this.dataSource.getRepository(CashMovement);
    const movements = await cashMovementRepo.find({
      where: { companyId, sourceType: CashMovementSourceType.PURCHASE_RECEIPT, sourceId: In(ids) },
    });
    const accountByReceiptId = new Map(movements.map((m) => [m.sourceId!, m.account]));
    const deductedIds = await this.acSupplierPaymentsService.findDeductedReceiptIds(companyId, ids, manager);
    return receipts.map((r) => ({
      ...r,
      paymentSource: accountByReceiptId.get(r.id) ?? (deductedIds.has(r.id) ? ('SUPPLIER_BALANCE' as const) : null),
    }));
  }

  async findAll(companyId: string, productId?: string, warehouseId?: string) {
    const receipts = await this.repo.find({
      where: {
        companyId,
        ...(productId ? { productId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      relations: ['product', 'warehouse', 'supplier', 'branch'],
      order: { createdAt: 'DESC' },
    });
    return this.attachPaymentSources(receipts, companyId);
  }

  /** Scoped to the caller's company — an id that belongs to another company 404s exactly like an id that doesn't exist at all, so ids can't be probed cross-company. */
  async findOne(id: string, companyId: string) {
    const receipt = await this.repo.findOne({
      where: { id, companyId },
      relations: ['product', 'warehouse', 'supplier', 'branch'],
    });
    if (!receipt) throw new NotFoundException('Purchase receipt not found');
    const [withSource] = await this.attachPaymentSources([receipt], companyId);
    return withSource;
  }

  /**
   * Records a delivery for an already-defined product: converts the entered package quantity to
   * base units, receives it into stock at the derived unit cost (weighted-average, via
   * StockService — this is what keeps Product.averageCost correct), and refreshes the product's
   * suggested prices from what was entered on *this* receipt. A future shipment with a different
   * price is just a new receipt — it never requires editing the product record.
   */
  async create(dto: CreatePurchaseReceiptDto, createdById: string, companyId: string): Promise<PurchaseReceipt> {
    return this.dataSource.transaction(async (manager) => {
      // Product and warehouse must belong to the caller's company — otherwise a client could
      // receive stock against another company's product/warehouse just by guessing its UUID.
      const product = await manager.getRepository(Product).findOne({ where: { id: dto.productId, companyId } });
      if (!product) throw new NotFoundException('Product not found');

      const warehouse = await manager
        .getRepository(Warehouse)
        .findOne({ where: { id: dto.warehouseId, companyId } });
      if (!warehouse) throw new NotFoundException('Warehouse not found');

      const supplier = await manager.getRepository(Supplier).findOne({ where: { id: dto.supplierId, companyId } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      await this.assertFreeGoodsAllowed(companyId, dto);

      const unitsPerPackage = Number(product.unitsPerPackage);
      // Guards the unitCost/totalUnits division below — a product saved without this conversion
      // factor (e.g. a legacy row from before it became a required field) would otherwise silently
      // persist Infinity/NaN onto the receipt instead of failing loudly here.
      if (!unitsPerPackage || unitsPerPackage <= 0) {
        throw new BadRequestException('This product has no valid units-per-package set');
      }
      const totalUnits = dto.quantityPackages * unitsPerPackage;
      const unitCost = Math.round((dto.packagePurchasePrice / unitsPerPackage) * 10000) / 10000;
      const totalAmount = dto.quantityPackages * dto.packagePurchasePrice;
      const paidAmount = dto.paidAmount ?? 0;
      if (paidAmount > totalAmount) {
        throw new BadRequestException('Paid amount cannot exceed the receipt total');
      }
      if (paidAmount > 0 && !dto.paymentAccount && !dto.paidFromSupplierBalance) {
        throw new BadRequestException('paymentAccount is required when paidAmount is greater than 0');
      }
      await this.assertSupplierBalancePaymentAllowed(companyId, dto);
      // Checked before any stock/receipt mutation runs — a rejected payment must abort the whole
      // operation before a single unit is added to the warehouse, not just before the cash
      // movement is recorded. (On this real backend everything below is inside the same DB
      // transaction, so a throw here or later would both roll back identically — this ordering
      // just avoids doing pointless work, and is required exactly as written by the offline mock,
      // which has no transaction/rollback to fall back on.) The supplier-balance path's own
      // sufficiency check happens later, inside deductForPurchase, once the document number (used
      // in its note) is known.
      if (paidAmount > 0 && !dto.paidFromSupplierBalance) {
        await this.cashMovementsService.assertSufficientBalance(
          companyId,
          dto.paymentAccount!,
          paidAmount,
          dto.branchId ?? undefined,
          manager,
        );
      }
      const documentNumber =
        (await this.numberingSeriesService.tryGetNextNumber(companyId, 'PURCHASE_RECEIPT')) ?? `REC-${Date.now()}`;

      await this.stockService.receive(
        {
          companyId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: totalUnits,
          unitCost,
          referenceType: 'PURCHASE_RECEIPT',
          referenceNumber: documentNumber,
          createdById,
        },
        StockMovementType.PURCHASE_RECEIPT,
        manager,
      );

      // A free goods receipt's price is 0 by definition — it must never overwrite the product's
      // own reference purchase price with that 0 (averageCost still updates normally via
      // stockService.receive() above, which is the correct place for a free batch to lower it).
      await manager.getRepository(Product).update(dto.productId, {
        ...(dto.isFreeGoods ? {} : { packagePurchasePrice: dto.packagePurchasePrice, purchasePrice: unitCost }),
        ...(dto.packageSellingPrice != null ? { packageSellingPrice: dto.packageSellingPrice } : {}),
        ...(dto.unitSellingPrice != null ? { sellingPrice: dto.unitSellingPrice } : {}),
      });

      const receipt = manager.getRepository(PurchaseReceipt).create({
        companyId,
        documentNumber,
        receiptDate: dto.receiptDate,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        supplierId: dto.supplierId,
        branchId: dto.branchId ?? null,
        quantityPackages: dto.quantityPackages,
        unitsPerPackage,
        totalUnits,
        packagePurchasePrice: dto.packagePurchasePrice,
        unitCost,
        totalAmount,
        paidAmount,
        packageSellingPrice: dto.packageSellingPrice ?? null,
        unitSellingPrice: dto.unitSellingPrice ?? null,
        isFreeGoods: dto.isFreeGoods ?? false,
        createdById,
      });
      const savedReceipt = await manager.getRepository(PurchaseReceipt).save(receipt);

      // Only the amount actually paid up front leaves the treasury or the supplier's own standalone
      // balance — the rest is owed to the supplier and settled later. A fully-credit (آجل) receipt
      // with paidAmount 0 correctly posts nothing here. Balance was already asserted sufficient
      // above (treasury path) or is asserted inside deductForPurchase (supplier-balance path).
      if (paidAmount > 0) {
        if (dto.paidFromSupplierBalance) {
          await this.acSupplierPaymentsService.deductForPurchase(
            dto.supplierId,
            companyId,
            paidAmount,
            savedReceipt.id,
            documentNumber,
            createdById,
            manager,
          );
        } else {
          await this.cashMovementsService.record(
            {
              companyId,
              branchId: dto.branchId ?? null,
              movementDate: dto.receiptDate,
              type: CashMovementType.EXPENSE,
              account: dto.paymentAccount!,
              amount: paidAmount,
              sourceType: CashMovementSourceType.PURCHASE_RECEIPT,
              sourceId: savedReceipt.id,
              partySupplierId: dto.supplierId,
              description: `Purchase receipt ${documentNumber}`,
              createdById,
            },
            manager,
          );
        }
      }

      return savedReceipt;
    });
  }

  /**
   * Edits a receipt by reversing its ORIGINAL stock effect (its own product/warehouse/quantity —
   * not the new ones) via a PURCHASE_RETURN issue, then reapplying the edited figures via a fresh
   * PURCHASE_RECEIPT receive. This handles a changed product, warehouse, quantity, or price
   * uniformly instead of computing a delta between old and new — the same reason the cash
   * movement is deleted and recreated rather than patched (see CashMovementsService.removeBySource).
   * The reversal issue() call throws if the warehouse no longer holds enough of the ORIGINAL
   * product/quantity (e.g. some of it was already sold or transferred elsewhere), which correctly
   * blocks an edit that can't be honestly reconciled rather than silently corrupting stock.
   *
   * The payment source (بنكي/كاش/رصيد المورد) follows the exact same reverse-then-reapply shape:
   * removeBySource + removeByPurchaseReceipt unconditionally clear BOTH possible old records before
   * anything new posts, so switching source on edit never double-counts or leaves a stale entry on
   * the old one. oldPaymentSource (captured before either removal) is compared against the newly
   * submitted source purely to annotate the new record when they actually differ — see auditNote
   * below — it plays no part in the reversal logic itself.
   */
  async update(
    id: string,
    dto: UpdatePurchaseReceiptDto,
    updatedById: string,
    companyId: string,
  ): Promise<PurchaseReceipt> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(PurchaseReceipt).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Purchase receipt not found');

      // Captured before anything below removes it — needed to tell whether this edit actually
      // switches the payment source (vs. just re-submitting the same one, or changing an unrelated
      // field like quantity) so the new transactions-log entry can record that as its own reason.
      const [{ paymentSource: oldPaymentSource }] = await this.attachPaymentSources([existing], companyId, manager);

      const product = await manager.getRepository(Product).findOne({ where: { id: dto.productId, companyId } });
      if (!product) throw new NotFoundException('Product not found');

      const warehouse = await manager
        .getRepository(Warehouse)
        .findOne({ where: { id: dto.warehouseId, companyId } });
      if (!warehouse) throw new NotFoundException('Warehouse not found');

      const supplier = await manager.getRepository(Supplier).findOne({ where: { id: dto.supplierId, companyId } });
      if (!supplier) throw new NotFoundException('Supplier not found');

      await this.assertFreeGoodsAllowed(companyId, dto);

      const unitsPerPackage = Number(product.unitsPerPackage);
      // Guards the unitCost/totalUnits division below — a product saved without this conversion
      // factor (e.g. a legacy row from before it became a required field) would otherwise silently
      // persist Infinity/NaN onto the receipt instead of failing loudly here.
      if (!unitsPerPackage || unitsPerPackage <= 0) {
        throw new BadRequestException('This product has no valid units-per-package set');
      }
      const totalUnits = dto.quantityPackages * unitsPerPackage;
      const unitCost = Math.round((dto.packagePurchasePrice / unitsPerPackage) * 10000) / 10000;
      const totalAmount = dto.quantityPackages * dto.packagePurchasePrice;
      const paidAmount = dto.paidAmount ?? 0;
      if (paidAmount > totalAmount) {
        throw new BadRequestException('Paid amount cannot exceed the receipt total');
      }
      if (paidAmount > 0 && !dto.paymentAccount && !dto.paidFromSupplierBalance) {
        throw new BadRequestException('paymentAccount is required when paidAmount is greater than 0');
      }
      await this.assertSupplierBalancePaymentAllowed(companyId, dto);

      // Checked (and the old payment removed) before any stock mutation runs — a rejected payment
      // must abort the whole edit before the original stock effect is even reversed, not just
      // before the new cash movement is recorded. Both prior payment records are removed
      // unconditionally, regardless of which source this edit is about to use — the original
      // payment may have used the OTHER source (e.g. treasury → رصيد المورد or vice versa), so both
      // must be cleared before reapplying. Removing them first means the checks below already
      // reflect that removal (no manual add-back needed) — see removeBySource's own comment for why
      // delete-then-recreate is used instead of patching amounts in place.
      await this.cashMovementsService.removeBySource(
        companyId,
        CashMovementSourceType.PURCHASE_RECEIPT,
        id,
        manager,
      );
      await this.acSupplierPaymentsService.removeByPurchaseReceipt(id, companyId, manager);
      if (paidAmount > 0 && !dto.paidFromSupplierBalance) {
        await this.cashMovementsService.assertSufficientBalance(
          companyId,
          dto.paymentAccount!,
          paidAmount,
          dto.branchId ?? undefined,
          manager,
        );
      }

      await this.stockService.issue(
        {
          companyId,
          productId: existing.productId,
          warehouseId: existing.warehouseId,
          quantity: Number(existing.totalUnits),
          referenceType: 'PURCHASE_RECEIPT_EDIT',
          referenceNumber: existing.documentNumber,
          createdById: updatedById,
        },
        StockMovementType.PURCHASE_RETURN,
        manager,
      );

      await this.stockService.receive(
        {
          companyId,
          productId: dto.productId,
          warehouseId: dto.warehouseId,
          quantity: totalUnits,
          unitCost,
          referenceType: 'PURCHASE_RECEIPT_EDIT',
          referenceNumber: existing.documentNumber,
          createdById: updatedById,
        },
        StockMovementType.PURCHASE_RECEIPT,
        manager,
      );

      // Same free-goods exception as create() — never let a 0 free-goods price overwrite the
      // product's own reference purchase price.
      await manager.getRepository(Product).update(dto.productId, {
        ...(dto.isFreeGoods ? {} : { packagePurchasePrice: dto.packagePurchasePrice, purchasePrice: unitCost }),
        ...(dto.packageSellingPrice != null ? { packageSellingPrice: dto.packageSellingPrice } : {}),
        ...(dto.unitSellingPrice != null ? { sellingPrice: dto.unitSellingPrice } : {}),
      });

      Object.assign(existing, {
        receiptDate: dto.receiptDate,
        productId: dto.productId,
        warehouseId: dto.warehouseId,
        supplierId: dto.supplierId,
        branchId: dto.branchId ?? null,
        quantityPackages: dto.quantityPackages,
        unitsPerPackage,
        totalUnits,
        packagePurchasePrice: dto.packagePurchasePrice,
        unitCost,
        totalAmount,
        paidAmount,
        packageSellingPrice: dto.packageSellingPrice ?? null,
        unitSellingPrice: dto.unitSellingPrice ?? null,
        isFreeGoods: dto.isFreeGoods ?? false,
      });
      const savedReceipt = await manager.getRepository(PurchaseReceipt).save(existing);

      // Old payment record (either kind) already removed and balance already asserted sufficient
      // above, before any stock mutation ran — this just posts the new one. If the payment SOURCE
      // itself changed (not just the amount/date), the new record's own note/description says so —
      // this is the "transactions log records the reason and date" trail for that switch.
      const newPaymentSource: PaymentSource = paidAmount === 0 ? null : dto.paidFromSupplierBalance ? 'SUPPLIER_BALANCE' : dto.paymentAccount ?? null;
      const sourceChanged = oldPaymentSource !== null && newPaymentSource !== null && oldPaymentSource !== newPaymentSource;
      const auditNote = sourceChanged
        ? ` — تم تعديل مصدر الدفع من ${PAYMENT_SOURCE_LABELS_AR[oldPaymentSource]} إلى ${PAYMENT_SOURCE_LABELS_AR[newPaymentSource]} بتاريخ ${new Date().toISOString().slice(0, 10)}`
        : '';
      if (paidAmount > 0) {
        if (dto.paidFromSupplierBalance) {
          await this.acSupplierPaymentsService.deductForPurchase(
            dto.supplierId,
            companyId,
            paidAmount,
            id,
            existing.documentNumber,
            updatedById,
            manager,
            auditNote,
          );
        } else {
          await this.cashMovementsService.record(
            {
              companyId,
              branchId: dto.branchId ?? null,
              movementDate: dto.receiptDate,
              type: CashMovementType.EXPENSE,
              account: dto.paymentAccount!,
              amount: paidAmount,
              sourceType: CashMovementSourceType.PURCHASE_RECEIPT,
              sourceId: id,
              partySupplierId: dto.supplierId,
              description: `Purchase receipt ${existing.documentNumber}${auditNote}`,
              createdById: updatedById,
            },
            manager,
          );
        }
      }

      return savedReceipt;
    });
  }

  /**
   * Cancels a receipt entirely: reverses its stock effect (PURCHASE_RETURN issue — throws if the
   * warehouse no longer holds enough, e.g. some of it was already sold elsewhere), removes its
   * linked cash movement (restoring whatever was paid back into the treasury balance), then
   * deletes the receipt row itself.
   *
   * System-wide delete-protection rule: SupplierPayment.purchaseReceiptId is a plain uuid column
   * with no FK/relation at all (see that entity) — a partial "دفع المتبقي" payment tied to this
   * receipt would otherwise be left pointing at a row that no longer exists, silently, with nothing
   * in the schema to stop it. Checked explicitly here since the database can't enforce it itself.
   */
  async remove(id: string, companyId: string, removedById: string): Promise<void> {
    const hasSupplierPayment = await this.dataSource
      .getRepository(SupplierPayment)
      .exist({ where: { purchaseReceiptId: id, companyId } });
    if (hasSupplierPayment) {
      throw new BadRequestException(
        'لا يمكن حذف إذن الاستلام هذا — توجد دفعة مورد مسجلة مرتبطة به. يجب حذف هذه الدفعة أولاً.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const receipt = await manager.getRepository(PurchaseReceipt).findOne({ where: { id, companyId } });
      if (!receipt) throw new NotFoundException('Purchase receipt not found');

      await this.stockService.issue(
        {
          companyId,
          productId: receipt.productId,
          warehouseId: receipt.warehouseId,
          quantity: Number(receipt.totalUnits),
          referenceType: 'PURCHASE_RECEIPT_CANCEL',
          referenceNumber: receipt.documentNumber,
          createdById: removedById,
        },
        StockMovementType.PURCHASE_RETURN,
        manager,
      );

      await this.cashMovementsService.removeBySource(
        companyId,
        CashMovementSourceType.PURCHASE_RECEIPT,
        id,
        manager,
      );
      await this.acSupplierPaymentsService.removeByPurchaseReceipt(id, companyId, manager);

      await manager.getRepository(PurchaseReceipt).remove(receipt);
    });
  }
}
