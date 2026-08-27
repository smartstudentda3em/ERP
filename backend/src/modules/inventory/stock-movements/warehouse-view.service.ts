import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { Product } from '../products/entities/product.entity';
import { Warehouse } from '../../settings/entities/warehouse.entity';
import { PurchaseReceipt } from './entities/purchase-receipt.entity';
import { SalesInvoiceLine } from '../../sales/sales-invoices/entities/sales-invoice.entity';
import { PaginatedResult } from '../../../common/dto/pagination-query.dto';
import { WarehouseProductsQueryDto } from './dto/warehouse-view.dto';
import {
  currentMonthRange,
  getConsumedQuantitiesByProductId,
  getPurchasedQuantitiesByProductId,
} from './consumed-quantity.util';
import { Company } from '../../settings/entities/company.entity';

const SORT_COLUMNS: Record<string, string> = {
  code: 'p.sku',
  barcode: 'p.barcode',
  name: 'p.nameEn',
  category: 'cat.nameEn',
  brand: 'brand.nameEn',
  unit: 'unit.nameEn',
  packageType: 'packageType.nameEn',
  quantity: 'sl.quantityOnHand',
  reserved: 'sl.reservedQuantity',
  minStock: 'p.reorderLevel',
  purchasePrice: 'p.purchasePrice',
  sellingPrice: 'p.sellingPrice',
  packagePurchasePrice: 'p.packagePurchasePrice',
  packageSellingPrice: 'p.packageSellingPrice',
  location: 'sl.location',
  updatedAt: 'sl.updatedAt',
};

/**
 * Stock status (in/low/out) is a company-wide question — a product isn't "out of stock" just
 * because the warehouse currently being viewed happens to be empty of it, if other branches still
 * carry it. Every status classification and status filter in this service compares against this
 * subquery's cross-warehouse sum rather than the single row's `quantityOnHand`.
 */
const COMPANY_QTY_SUBQUERY = `(SELECT COALESCE(SUM(sl2."quantityOnHand"), 0) FROM stock_levels sl2 WHERE sl2."productId" = p.id)`;

@Injectable()
export class WarehouseViewService {
  constructor(
    @InjectRepository(StockLevel) private readonly stockLevelRepo: Repository<StockLevel>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(StockMovement) private readonly stockMovementRepo: Repository<StockMovement>,
    @InjectRepository(Warehouse) private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(PurchaseReceipt)
    private readonly purchaseReceiptRepo: Repository<PurchaseReceipt>,
    @InjectRepository(SalesInvoiceLine) private readonly salesInvoiceLineRepo: Repository<SalesInvoiceLine>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Confirms the warehouse belongs to the caller's company before anything else runs — otherwise a client could read another company's warehouse stock just by guessing its UUID. */
  private async assertWarehouseInCompany(warehouseId: string, companyId: string): Promise<void> {
    const warehouse = await this.warehouseRepo.findOne({ where: { id: warehouseId, companyId } });
    if (!warehouse) throw new NotFoundException('Warehouse not found');
  }

  private baseQuery(warehouseId: string, companyId: string, withSelect = false) {
    const qb = this.stockLevelRepo.createQueryBuilder('sl');
    if (withSelect) {
      qb.innerJoinAndSelect('sl.product', 'p')
        .leftJoinAndSelect('p.category', 'cat')
        .leftJoinAndSelect('p.brand', 'brand')
        .leftJoinAndSelect('p.unit', 'unit')
        .leftJoinAndSelect('p.packageType', 'packageType');
    } else {
      qb.innerJoin('sl.product', 'p').leftJoin('p.category', 'cat').leftJoin('p.brand', 'brand').leftJoin(
        'p.unit',
        'unit',
      );
    }
    return qb.where('sl."warehouseId" = :warehouseId AND sl."companyId" = :companyId', { warehouseId, companyId });
  }

  /** Shared between getSummary and getProducts so the summary cards can never drift out of sync
   * with what the table below is actually showing — same search/category/brand/status conditions,
   * applied the same way, in both places. */
  private applyProductFilters(
    qb: SelectQueryBuilder<StockLevel>,
    query: Pick<WarehouseProductsQueryDto, 'search' | 'categoryId' | 'brandId' | 'status'>,
  ): void {
    // Multi-keyword, cross-column, order-independent — each space-separated keyword must appear in
    // SOME searchable column (not necessarily the same one), so e.g. "سبليت 1.5" matches a product
    // whose name is "تكييف سبليت" and whose sku happens to contain "1.5", in either typed order.
    // Mirrors the same convention already used by DataTable.tsx's own client-side search and
    // RepresentativesListTab.tsx's rep search.
    if (query.search) {
      const keywords = query.search.trim().split(/\s+/).filter(Boolean);
      keywords.forEach((keyword, i) => {
        qb.andWhere(
          `(p.sku ILIKE :search${i} OR p.barcode ILIKE :search${i} OR p."nameEn" ILIKE :search${i} OR p."nameAr" ILIKE :search${i})`,
          { [`search${i}`]: `%${keyword}%` },
        );
      });
    }
    if (query.categoryId) qb.andWhere('p."categoryId" = :categoryId', { categoryId: query.categoryId });
    if (query.brandId) qb.andWhere('p."brandId" = :brandId', { brandId: query.brandId });
    if (query.status === 'out') qb.andWhere(`${COMPANY_QTY_SUBQUERY} <= 0`);
    else if (query.status === 'low')
      qb.andWhere(`${COMPANY_QTY_SUBQUERY} > 0 AND ${COMPANY_QTY_SUBQUERY} <= p."reorderLevel"`);
    else if (query.status === 'in') qb.andWhere(`${COMPANY_QTY_SUBQUERY} > p."reorderLevel"`);
  }

  async getSummary(
    warehouseId: string,
    companyId: string,
    query: Pick<WarehouseProductsQueryDto, 'search' | 'categoryId' | 'brandId' | 'status'>,
  ) {
    await this.assertWarehouseInCompany(warehouseId, companyId);
    const qb = this.baseQuery(warehouseId, companyId);
    this.applyProductFilters(qb, query);
    const rows = await qb
      .select('sl.quantityOnHand', 'quantityOnHand')
      .addSelect('sl.averageCost', 'averageCost')
      .addSelect('p.reorderLevel', 'reorderLevel')
      .addSelect('p.unitsPerPackage', 'unitsPerPackage')
      .addSelect(COMPANY_QTY_SUBQUERY, 'companyQty')
      .getRawMany();

    let totalPackageQuantity = 0;
    let totalUnits = 0;
    let totalValue = 0;
    let lowStockItems = 0;
    let outOfStockItems = 0;

    for (const r of rows) {
      const qty = Number(r.quantityOnHand);
      const cost = Number(r.averageCost);
      const reorderLevel = Number(r.reorderLevel);
      const unitsPerPackage = Number(r.unitsPerPackage) || 1;
      const companyQty = Number(r.companyQty);
      // Package-based aggregation: convert this line's on-hand units to packages and its average
      // cost to a per-package cost before summing, so the totals read in the same "cartons" the
      // rest of this screen is denominated in, per the packaging-first display convention.
      const packages = qty / unitsPerPackage;
      const packageCost = cost * unitsPerPackage;
      totalPackageQuantity += packages;
      // Raw on-hand unit count (not divided into packages) — the Printing Press warehouse view
      // shows this instead of totalPackageQuantity, since a press cares about individual units.
      totalUnits += qty;
      totalValue += packages * packageCost;
      // Low/out counts reflect the product's company-wide balance, not this warehouse's row alone.
      if (companyQty <= 0) outOfStockItems++;
      else if (companyQty <= reorderLevel) lowStockItems++;
    }

    return {
      totalProducts: rows.length,
      totalPackageQuantity,
      totalUnits,
      totalValue,
      lowStockItems,
      outOfStockItems,
    };
  }

  async getProducts(
    warehouseId: string,
    companyId: string,
    query: WarehouseProductsQueryDto,
  ): Promise<PaginatedResult<any>> {
    await this.assertWarehouseInCompany(warehouseId, companyId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const qb = this.baseQuery(warehouseId, companyId, true);
    this.applyProductFilters(qb, query);

    const total = await qb.getCount();

    const sortColumn = SORT_COLUMNS[query.sortBy ?? ''] ?? 'p.nameEn';
    qb.orderBy(sortColumn, query.sortOrder === 'DESC' ? 'DESC' : 'ASC');
    qb.skip((page - 1) * limit).take(limit);

    qb.addSelect(COMPANY_QTY_SUBQUERY, 'companyQty');
    const { entities, raw } = await qb.getRawAndEntities();

    // "الكمية المستهلكة" — one grouped SUM query scoped to just this page's product ids (never
    // all products in the warehouse), so it stays cheap regardless of catalog size. Falls back to
    // the current calendar month when the page's own date filter is left empty, matching
    // "الفترة الحالية" per the column's own spec.
    const defaultRange = currentMonthRange();
    const dateFrom = query.dateFrom ?? defaultRange.dateFrom;
    const dateTo = query.dateTo ?? defaultRange.dateTo;
    const productIds = entities.map((sl) => sl.product.id);
    const consumedByProductId = await getConsumedQuantitiesByProductId(
      this.dataSource,
      companyId,
      warehouseId,
      productIds,
      dateFrom,
      dateTo,
    );

    // "الكمية المشتراة" and dropping the package price columns are Air Conditioning-only changes
    // to this table — Stationery/Printing Press keep every field exactly as before.
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    const isAirConditioning = company?.code === 'AC';
    const purchasedByProductId = isAirConditioning
      ? await getPurchasedQuantitiesByProductId(this.dataSource, companyId, productIds)
      : new Map<string, number>();

    const items = entities.map((sl, i) => {
      const p = sl.product;
      const qty = Number(sl.quantityOnHand);
      const reorderLevel = Number(p.reorderLevel);
      const companyQty = Number(raw[i].companyQty);
      // Status reflects the product's total balance across every warehouse, not this row alone.
      const status = companyQty <= 0 ? 'out' : companyQty <= reorderLevel ? 'low' : 'in';
      const unitsPerPackage = p.unitsPerPackage ? Number(p.unitsPerPackage) : null;
      return {
        stockLevelId: sl.id,
        productId: p.id,
        sku: p.sku,
        barcode: p.barcode,
        nameEn: p.nameEn,
        nameAr: p.nameAr,
        category: p.category ? { id: p.category.id, name: p.category.nameEn } : null,
        brand: p.brand ? { id: p.brand.id, name: p.brand.nameEn } : null,
        unit: p.unit ? { id: p.unit.id, code: p.unit.code, name: p.unit.nameEn } : null,
        packageType: p.packageType ? { id: p.packageType.id, code: p.packageType.code, name: p.packageType.nameEn } : null,
        unitsPerPackage,
        quantityOnHand: qty,
        packageBreakdown: unitsPerPackage
          ? { packages: Math.floor(qty / unitsPerPackage), remainderUnits: qty % unitsPerPackage }
          : null,
        reservedQuantity: Number(sl.reservedQuantity),
        consumedQuantity: consumedByProductId.get(p.id) ?? 0,
        quantityPurchased: purchasedByProductId.get(p.id) ?? 0,
        minimumStock: reorderLevel,
        purchasePrice: Number(p.purchasePrice),
        sellingPrice: Number(p.sellingPrice),
        ...(isAirConditioning
          ? {}
          : {
              packagePurchasePrice: p.packagePurchasePrice != null ? Number(p.packagePurchasePrice) : null,
              packageSellingPrice: p.packageSellingPrice != null ? Number(p.packageSellingPrice) : null,
            }),
        location: sl.location,
        status,
        updatedAt: sl.updatedAt,
        imageUrl: p.imageUrl,
      };
    });

    return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async getProductOverview(productId: string, companyId: string, warehouseId?: string) {
    if (warehouseId) await this.assertWarehouseInCompany(warehouseId, companyId);

    const product = await this.productRepo.findOne({
      where: { id: productId, companyId },
      relations: ['category', 'brand', 'unit', 'packageType'],
    });
    if (!product) throw new NotFoundException('Product not found');

    const unitsPerPackage = product.unitsPerPackage ? Number(product.unitsPerPackage) : null;
    const toPackageBreakdown = (baseQty: number) =>
      unitsPerPackage
        ? { packages: Math.floor(baseQty / unitsPerPackage), remainderUnits: baseQty % unitsPerPackage }
        : null;

    const stockByWarehouse = await this.stockLevelRepo.find({
      where: { productId, companyId },
      relations: ['warehouse'],
    });

    const movements = await this.stockMovementRepo.find({
      where: { productId, companyId, ...(warehouseId ? { warehouseId } : {}) },
      order: { createdAt: 'DESC' },
      relations: ['warehouse'],
      take: 100,
    });

    const purchaseReceipts = await this.purchaseReceiptRepo.find({
      where: { productId },
      relations: ['supplier'],
      order: { receiptDate: 'DESC' },
      take: 100,
    });

    const salesLines = await this.salesInvoiceLineRepo.find({
      where: { productId },
      relations: ['invoice', 'invoice.customer'],
      order: { invoice: { invoiceDate: 'DESC' } },
      take: 100,
    });

    const purchaseHistory = purchaseReceipts.map((r) => ({
      documentNumber: r.documentNumber,
      date: r.receiptDate,
      supplierName: r.supplier.companyName,
      quantity: Number(r.totalUnits),
      unitCost: Number(r.unitCost),
      lineTotal: Number(r.totalAmount),
    }));

    const salesHistory = salesLines.map((l) => ({
      documentNumber: l.invoice.documentNumber,
      date: l.invoice.invoiceDate,
      customerName: l.invoice.customer.name,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    }));

    const latestSupplier = purchaseHistory.length > 0 ? purchaseHistory[0].supplierName : null;

    return {
      product: {
        id: product.id,
        sku: product.sku,
        barcode: product.barcode,
        nameEn: product.nameEn,
        nameAr: product.nameAr,
        category: product.category ? { id: product.category.id, name: product.category.nameEn } : null,
        brand: product.brand ? { id: product.brand.id, name: product.brand.nameEn } : null,
        unit: product.unit ? { id: product.unit.id, name: product.unit.nameEn } : null,
        purchasePrice: Number(product.purchasePrice),
        sellingPrice: Number(product.sellingPrice),
        averageCost: Number(product.averageCost),
        reorderLevel: Number(product.reorderLevel),
        imageUrl: product.imageUrl,
        packageType: product.packageType ? { id: product.packageType.id, name: product.packageType.nameEn } : null,
        unitsPerPackage,
        packagePurchasePrice: product.packagePurchasePrice != null ? Number(product.packagePurchasePrice) : null,
        packageSellingPrice: product.packageSellingPrice != null ? Number(product.packageSellingPrice) : null,
        notes: product.notes,
        isActive: product.isActive,
      },
      stockByWarehouse: stockByWarehouse.map((sl) => ({
        warehouseId: sl.warehouseId,
        warehouseCode: sl.warehouse.code,
        warehouseName: sl.warehouse.nameEn,
        quantityOnHand: Number(sl.quantityOnHand),
        reservedQuantity: Number(sl.reservedQuantity),
        location: sl.location,
        packageBreakdown: toPackageBreakdown(Number(sl.quantityOnHand)),
      })),
      movements: movements.map((m) => ({
        id: m.id,
        date: m.createdAt,
        type: m.type,
        warehouseName: m.warehouse?.nameEn,
        quantity: Number(m.quantity),
        unitCost: Number(m.unitCost),
        totalCost: Number(m.totalCost),
        referenceNumber: m.referenceNumber,
      })),
      purchaseHistory,
      salesHistory,
      supplier: latestSupplier,
    };
  }
}
