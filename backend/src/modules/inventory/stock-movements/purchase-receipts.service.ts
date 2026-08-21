import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PurchaseReceipt } from './entities/purchase-receipt.entity';
import { StockService } from './stock.service';
import { CashMovementSourceType, CashMovementType, StockMovementType } from '../../../entities/enums';
import { CreatePurchaseReceiptDto, UpdatePurchaseReceiptDto } from './dto/stock.dto';
import { Product } from '../products/entities/product.entity';
import { Warehouse } from '../../settings/entities/warehouse.entity';
import { Supplier } from '../../parties/suppliers/entities/supplier.entity';
import { Company } from '../../settings/entities/company.entity';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { CashMovementsService } from '../../treasury/cash-movements.service';

@Injectable()
export class PurchaseReceiptsService {
  constructor(
    @InjectRepository(PurchaseReceipt) private readonly repo: Repository<PurchaseReceipt>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly cashMovementsService: CashMovementsService,
  ) {}

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

  findAll(companyId: string, productId?: string, warehouseId?: string) {
    return this.repo.find({
      where: {
        companyId,
        ...(productId ? { productId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      relations: ['product', 'warehouse', 'supplier', 'branch'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Scoped to the caller's company — an id that belongs to another company 404s exactly like an id that doesn't exist at all, so ids can't be probed cross-company. */
  async findOne(id: string, companyId: string): Promise<PurchaseReceipt> {
    const receipt = await this.repo.findOne({
      where: { id, companyId },
      relations: ['product', 'warehouse', 'supplier', 'branch'],
    });
    if (!receipt) throw new NotFoundException('Purchase receipt not found');
    return receipt;
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
      if (paidAmount > 0 && !dto.paymentAccount) {
        throw new BadRequestException('paymentAccount is required when paidAmount is greater than 0');
      }
      // Checked before any stock/receipt mutation runs — a rejected payment must abort the whole
      // operation before a single unit is added to the warehouse, not just before the cash
      // movement is recorded. (On this real backend everything below is inside the same DB
      // transaction, so a throw here or later would both roll back identically — this ordering
      // just avoids doing pointless work, and is required exactly as written by the offline mock,
      // which has no transaction/rollback to fall back on.)
      if (paidAmount > 0) {
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

      // Only the amount actually paid up front (cash/transfer) leaves the treasury — the rest is
      // owed to the supplier and settled later via a separate supplier payment. A fully-credit
      // (آجل) receipt with paidAmount 0 correctly debits nothing here. Balance was already
      // asserted sufficient above, before the stock receive — this just posts the movement.
      if (paidAmount > 0) {
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
      if (paidAmount > 0 && !dto.paymentAccount) {
        throw new BadRequestException('paymentAccount is required when paidAmount is greater than 0');
      }

      // Checked (and the old payment removed) before any stock mutation runs — a rejected payment
      // must abort the whole edit before the original stock effect is even reversed, not just
      // before the new cash movement is recorded. Removing the old movement first means this check
      // already reflects that removal (no manual add-back needed) — see removeBySource's own
      // comment for why delete-then-recreate is used instead of patching amounts in place.
      await this.cashMovementsService.removeBySource(
        companyId,
        CashMovementSourceType.PURCHASE_RECEIPT,
        id,
        manager,
      );
      if (paidAmount > 0) {
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

      // Old movement already removed and balance already asserted sufficient above, before any
      // stock mutation ran — this just posts the new movement.
      if (paidAmount > 0) {
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
            description: `Purchase receipt ${existing.documentNumber}`,
            createdById: updatedById,
          },
          manager,
        );
      }

      return savedReceipt;
    });
  }

  /**
   * Cancels a receipt entirely: reverses its stock effect (PURCHASE_RETURN issue — throws if the
   * warehouse no longer holds enough, e.g. some of it was already sold elsewhere), removes its
   * linked cash movement (restoring whatever was paid back into the treasury balance), then
   * deletes the receipt row itself.
   */
  async remove(id: string, companyId: string, removedById: string): Promise<void> {
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

      await manager.getRepository(PurchaseReceipt).remove(receipt);
    });
  }
}
