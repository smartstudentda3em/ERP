import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, QueryFailedError, Repository } from 'typeorm';
import { BaseCrudService } from '../../../common/services/base-crud.service';
import { Product } from './entities/product.entity';
import { CreateProductDto, UpdateProductDto, CreateCatalogProductDto, UpdateCatalogProductDto } from './dto/product.dto';
import { StockMovement } from '../stock-movements/entities/stock-movement.entity';
import { ProductType } from '../../../entities/enums';
import { Unit } from '../../settings/entities/unit.entity';
import { PackageType } from '../../settings/entities/package-type.entity';
import { ProductCategory } from '../../settings/entities/product-category.entity';
import { Company } from '../../settings/entities/company.entity';
import { SalesRepAccessService } from '../../../common/services/sales-rep-access.service';

interface PackagingFields {
  packageTypeId?: string | null;
  unitsPerPackage?: number | null;
  packagePurchasePrice?: number | null;
}

@Injectable()
export class ProductsService extends BaseCrudService<Product> {
  constructor(
    @InjectRepository(Product) repo: Repository<Product>,
    @InjectRepository(StockMovement) private readonly stockMovementRepo: Repository<StockMovement>,
    @InjectRepository(Unit) private readonly unitRepo: Repository<Unit>,
    @InjectRepository(PackageType) private readonly packageTypeRepo: Repository<PackageType>,
    @InjectRepository(ProductCategory) private readonly categoryRepo: Repository<ProductCategory>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    private readonly salesRepAccess: SalesRepAccessService,
  ) {
    super(repo);
  }

  /**
   * Derives the per-base-unit purchase price from the package purchase price. Packaging is
   * mandatory on every product, so this always resolves on create(); update() merges in the
   * existing record's packaging fields first so a partial update (e.g. only packageSellingPrice)
   * still recomputes correctly against whatever packaging was already saved.
   */
  private computePackageDerivedPurchasePrice(fields: PackagingFields): number | undefined {
    if (fields.packageTypeId && fields.unitsPerPackage && fields.packagePurchasePrice != null) {
      return Math.round((fields.packagePurchasePrice / fields.unitsPerPackage) * 10000) / 10000;
    }
    return undefined;
  }

  /**
   * `repo.save()` has no application-level guard for a category/unit/package/brand id that's been
   * deleted out from under an open form — it surfaces as a raw Postgres `QueryFailedError`, which
   * the global exception filter would otherwise forward as an opaque 500 with driver text instead
   * of a message the frontend can show the user. The 23505 branch is a defensive fallback (SKU/
   * barcode duplicates are normally caught earlier by assertSkuBarcodeUnique, which is where the
   * AC exemption lives — there's no DB unique constraint left on this entity to actually trigger
   * it); 23503 (foreign key) is the one that still happens in practice.
   */
  private toFriendlySaveError(err: unknown): Error {
    const code = (err instanceof QueryFailedError ? (err as any).driverError?.code ?? (err as any).code : undefined) as
      | string
      | undefined;
    if (code === '23505') return new ConflictException('SKU or barcode already exists');
    if (code === '23503') return new BadRequestException('Selected category, unit, package type, or brand is invalid');
    return err instanceof Error ? err : new Error(String(err));
  }

  /** SKU/barcode ("القدرة" for AC) uniqueness is a per-company business rule, not a DB constraint
   * (see the entity's comment) — every company gets a real duplicate rejection here, except AC
   * (Air Conditioning), where the same SKU/capacity code legitimately repeats across a split
   * unit's indoor/outdoor halves, so this is a deliberate no-op there. `excludeId` lets an edit
   * pass its own unchanged sku/barcode back without tripping on itself. */
  private async assertSkuBarcodeUnique(
    companyId: string,
    dto: { sku?: string; barcode?: string },
    excludeId?: string,
  ): Promise<void> {
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    if (company?.code === 'AC') return;
    if (dto.sku) {
      const existing = await this.repo.findOne({ where: { companyId, sku: dto.sku } });
      if (existing && existing.id !== excludeId) throw new ConflictException('SKU already exists');
    }
    if (dto.barcode) {
      const existing = await this.repo.findOne({ where: { companyId, barcode: dto.barcode } });
      if (existing && existing.id !== excludeId) throw new ConflictException('Barcode already exists');
    }
  }

  /** Scoped to the caller's company — an id that belongs to another company 404s exactly like an id that doesn't exist at all, so ids can't be probed cross-company. */
  async findOneScoped(id: string, companyId: string): Promise<Product> {
    const product = await super.findOne(id);
    if (product.companyId !== companyId) throw new NotFoundException('Product not found');
    return product;
  }

  /** Strips purchase-cost/margin fields entirely from the response (not merely nulled — genuinely
   * absent from the JSON) for a caller holding the "مندوب" role. Applied by every product-list
   * method a مندوب can reach, directly or indirectly (e.g. via SalesLineEditor.tsx, the Sales
   * Invoice line editor, which fetches full product records purely to price a sale) — a مندوب must
   * never receive purchasePrice/packagePurchasePrice/averageCost/wholesalePrice, even in a raw API
   * response they'd never render, matching the restriction findRepViewForCompany already enforces
   * for the dedicated Products browsing screen. No-ops (skipping the extra DB lookup) when
   * `userId` isn't supplied — every caller of these methods should pass it. */
  private async maybeStripCostFields(products: Product[], userId?: string): Promise<Product[]> {
    if (!userId) return products;
    const isRep = await this.salesRepAccess.isCallerSalesRep(userId);
    if (!isRep) return products;
    return products.map((p) => {
      const { purchasePrice, packagePurchasePrice, averageCost, wholesalePrice, ...rest } = p;
      return rest as Product;
    });
  }

  /** Raw materials only — the Printing Press "المنتجات" catalog (ProductType.CATALOG_ITEM) has its
   * own separate list (findCatalogForCompany) and never appears here, for this or any company. */
  async findAllForCompany(companyId: string, search?: string, userId?: string): Promise<Product[]> {
    const products = await (search?.trim()
      ? this.search(companyId, search)
      : this.repo.find({
          where: { companyId, productType: ProductType.RAW_MATERIAL } as any,
          order: { createdAt: 'ASC' },
        }));
    return this.maybeStripCostFields(products, userId);
  }

  /** Printing Press "المنتجات" catalog only — every other company never has CATALOG_ITEM rows. */
  async findCatalogForCompany(companyId: string, userId?: string): Promise<Product[]> {
    const products = await this.repo.find({
      where: { companyId, productType: ProductType.CATALOG_ITEM } as any,
      order: { createdAt: 'ASC' },
    });
    return this.maybeStripCostFields(products, userId);
  }

  /** Raw materials explicitly flagged "قابلة للبيع المباشر" — merged into the Printing Press sales
   * invoice/quotation item picker alongside catalog items (see SalesLineEditor). Every other
   * company simply never sets isSellable, so this always returns empty for them. */
  async findSellableRawMaterialsForCompany(companyId: string, userId?: string): Promise<Product[]> {
    const products = await this.repo.find({
      where: { companyId, productType: ProductType.RAW_MATERIAL, isSellable: true } as any,
      order: { createdAt: 'ASC' },
    });
    return this.maybeStripCostFields(products, userId);
  }

  async createForCompany(dto: CreateProductDto, companyId: string): Promise<Product> {
    await this.assertSkuBarcodeUnique(companyId, dto);
    const derivedPurchasePrice = this.computePackageDerivedPurchasePrice(dto);
    const finalDto = derivedPurchasePrice !== undefined ? { ...dto, purchasePrice: derivedPurchasePrice } : dto;
    // No stock movement can exist yet for a brand-new product, so the average cost starts out
    // equal to the entered purchase price (0 only if no purchase price was ever given) rather
    // than the misleading 0 you'd get by leaving it untouched until the first real receipt.
    try {
      return await this.repo.save(
        this.repo.create({ ...finalDto, companyId, averageCost: derivedPurchasePrice ?? 0 } as DeepPartial<Product>),
      );
    } catch (err) {
      throw this.toFriendlySaveError(err);
    }
  }

  async updateScoped(id: string, companyId: string, dto: UpdateProductDto): Promise<Product> {
    const existing = await this.findOneScoped(id, companyId);
    await this.assertSkuBarcodeUnique(companyId, dto, id);

    const merged: PackagingFields = {
      packageTypeId: dto.packageTypeId !== undefined ? dto.packageTypeId : existing.packageTypeId,
      unitsPerPackage: dto.unitsPerPackage !== undefined ? dto.unitsPerPackage : existing.unitsPerPackage,
      packagePurchasePrice:
        dto.packagePurchasePrice !== undefined ? dto.packagePurchasePrice : existing.packagePurchasePrice,
    };
    const derivedPurchasePrice = this.computePackageDerivedPurchasePrice(merged);
    const finalDto: Record<string, unknown> =
      derivedPurchasePrice !== undefined ? { ...dto, purchasePrice: derivedPurchasePrice } : { ...dto };

    // Once a real purchase/sale movement has posted, StockService owns averageCost exclusively
    // (weighted-average costing) — a product edit must never overwrite that. Only while the
    // product has never moved does editing the purchase price keep averageCost in sync with it.
    if (derivedPurchasePrice !== undefined) {
      const movementCount = await this.stockMovementRepo.count({ where: { productId: id } });
      if (movementCount === 0) {
        finalDto.averageCost = derivedPurchasePrice;
      }
    }

    try {
      return await super.update(id, finalDto as any);
    } catch (err) {
      throw this.toFriendlySaveError(err);
    }
  }

  async removeScoped(id: string, companyId: string): Promise<void> {
    const product = await this.findOneScoped(id, companyId);
    await this.repo.remove(product);
  }

  findByBarcodeForCompany(barcode: string, companyId: string) {
    return this.repo.findOne({ where: { barcode, companyId } });
  }

  /**
   * Matches partially and case-insensitively (ILIKE %term%) across SKU, barcode, name, brand, and
   * category — the exact five fields the Products screen's search bar covers, deliberately
   * excluding anything warehouse/stock-related. `nameEn`, `categoryId`, `brandId` carry their own
   * indexes (see the entity) so this stays fast as the catalog grows.
   */
  async search(companyId: string, term: string): Promise<Product[]> {
    const q = `%${term.trim()}%`;
    return this.repo
      .createQueryBuilder('p')
      .leftJoin('brands', 'b', 'b.id = p."brandId"')
      .leftJoin('product_categories', 'c', 'c.id = p."categoryId"')
      .where('p."companyId" = :companyId', { companyId })
      .andWhere('p."productType" = :pt', { pt: ProductType.RAW_MATERIAL })
      .andWhere(
        '(p.sku ILIKE :q OR p.barcode ILIKE :q OR p."nameEn" ILIKE :q OR b."nameEn" ILIKE :q OR c."nameEn" ILIKE :q)',
        { q },
      )
      .orderBy('p."createdAt"', 'ASC')
      .getMany();
  }

  async lowStockForCompany(companyId: string) {
    return this.repo
      .createQueryBuilder('p')
      .leftJoin('stock_levels', 'sl', 'sl."productId" = p.id')
      .select('p.*')
      .addSelect('COALESCE(SUM(sl."quantityOnHand"), 0)', 'totalOnHand')
      .where('p."isActive" = true')
      .andWhere('p."companyId" = :companyId', { companyId })
      .groupBy('p.id')
      .having('COALESCE(SUM(sl."quantityOnHand"), 0) <= p."reorderLevel"')
      .getRawMany();
  }

  /**
   * "مندوب" role's restricted product view — only code/barcode, name, package type, and a
   * computed availability status ever leave the server here; quantities, costs, and prices are
   * never selected at all (not merely hidden client-side), per the explicit requirement that this
   * role can't see stock totals or any monetary figure. Covers every product type (raw materials
   * and, for Printing Press, catalog items) since a مندوب may be invoicing either.
   */
  async findRepViewForCompany(companyId: string): Promise<
    {
      id: string;
      sku: string | null;
      barcode: string | null;
      nameAr: string;
      nameEn: string;
      packageTypeNameAr: string | null;
      packageTypeNameEn: string | null;
      availabilityStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
    }[]
  > {
    const rows = await this.repo
      .createQueryBuilder('p')
      .leftJoin('stock_levels', 'sl', 'sl."productId" = p.id')
      .leftJoin('package_types', 'pt', 'pt.id = p."packageTypeId"')
      .select('p.id', 'id')
      .addSelect('p.sku', 'sku')
      .addSelect('p.barcode', 'barcode')
      .addSelect('p."nameAr"', 'nameAr')
      .addSelect('p."nameEn"', 'nameEn')
      .addSelect('pt."nameAr"', 'packageTypeNameAr')
      .addSelect('pt."nameEn"', 'packageTypeNameEn')
      .addSelect('p."reorderLevel"', 'reorderLevel')
      .addSelect('COALESCE(SUM(sl."quantityOnHand"), 0)', 'totalOnHand')
      .where('p."isActive" = true')
      .andWhere('p."companyId" = :companyId', { companyId })
      .groupBy('p.id')
      .addGroupBy('pt.id')
      .orderBy('p."nameAr"', 'ASC')
      .getRawMany();

    return rows.map((r) => {
      const total = Number(r.totalOnHand);
      const reorderLevel = Number(r.reorderLevel ?? 0);
      const availabilityStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' =
        total <= 0 ? 'OUT_OF_STOCK' : total <= reorderLevel ? 'LOW_STOCK' : 'IN_STOCK';
      return {
        id: r.id,
        sku: r.sku,
        barcode: r.barcode,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        packageTypeNameAr: r.packageTypeNameAr,
        packageTypeNameEn: r.packageTypeNameEn,
        availabilityStatus,
      };
    });
  }

  /**
   * Catalog items carry no real category/unit/packaging — those columns are mandatory on the
   * shared `products` table purely for the raw-materials side, so this finds (or lazily creates,
   * first time only) one hidden placeholder row per company to satisfy them, invisible to the
   * "المنتجات" screen's user-facing 4-field form.
   */
  private async resolveCatalogDefaults(
    companyId: string,
  ): Promise<{ categoryId: string; unitId: string; packageTypeId: string }> {
    let category = await this.categoryRepo.findOne({ where: { companyId, code: 'CATALOG' } });
    if (!category) {
      category = await this.categoryRepo.save(
        this.categoryRepo.create({ companyId, code: 'CATALOG', nameEn: 'Printing Products', nameAr: 'منتجات المطبعة' }),
      );
    }
    // Unit/PackageType both have a mandatory categoryId (drives the dependent dropdowns on the
    // real product-create form) — this hidden placeholder row must satisfy that constraint too,
    // or the insert throws a raw not-null violation instead of ever reaching super.create().
    let unit = await this.unitRepo.findOne({ where: { companyId, code: 'PCS' } });
    if (!unit) {
      unit = await this.unitRepo.save(
        this.unitRepo.create({ companyId, code: 'PCS', nameEn: 'Piece', nameAr: 'قطعة', categoryId: category.id }),
      );
    }
    let packageType = await this.packageTypeRepo.findOne({ where: { companyId, code: 'ITEM' } });
    if (!packageType) {
      packageType = await this.packageTypeRepo.save(
        this.packageTypeRepo.create({ companyId, code: 'ITEM', nameEn: 'Item', nameAr: 'صنف', categoryId: category.id }),
      );
    }
    return { categoryId: category.id, unitId: unit.id, packageTypeId: packageType.id };
  }

  async createCatalogItem(dto: CreateCatalogProductDto, companyId: string): Promise<Product> {
    const defaults = await this.resolveCatalogDefaults(companyId);
    try {
      return await super.create({
        companyId,
        nameEn: dto.nameEn,
        nameAr: dto.nameEn,
        size: dto.size,
        notes: dto.notes,
        sellingPrice: dto.sellingPrice ?? null,
        categoryId: defaults.categoryId,
        unitId: defaults.unitId,
        packageTypeId: defaults.packageTypeId,
        unitsPerPackage: 1,
        productType: ProductType.CATALOG_ITEM,
        averageCost: 0,
        purchasePrice: 0,
      } as any);
    } catch (err) {
      throw this.toFriendlySaveError(err);
    }
  }

  async updateCatalogItem(id: string, companyId: string, dto: UpdateCatalogProductDto): Promise<Product> {
    const existing = await this.findOneScoped(id, companyId);
    if (existing.productType !== ProductType.CATALOG_ITEM) throw new NotFoundException('Product not found');
    const patch: Record<string, unknown> = {};
    if (dto.nameEn !== undefined) {
      patch.nameEn = dto.nameEn;
      patch.nameAr = dto.nameEn;
    }
    if (dto.size !== undefined) patch.size = dto.size;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (dto.sellingPrice !== undefined) patch.sellingPrice = dto.sellingPrice;
    try {
      return await super.update(id, patch as any);
    } catch (err) {
      throw this.toFriendlySaveError(err);
    }
  }
}
