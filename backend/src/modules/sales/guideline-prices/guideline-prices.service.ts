import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { GuidelinePriceSheet, GuidelinePriceLine } from './entities/guideline-price.entity';
import { CreateGuidelinePriceSheetDto, UpdateGuidelinePriceSheetDto } from './dto/guideline-price.dto';

@Injectable()
export class GuidelinePricesService {
  constructor(
    @InjectRepository(GuidelinePriceSheet) private readonly repo: Repository<GuidelinePriceSheet>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Lines (with their product) are eager-loaded here — unlike Quotations' list, the Guideline
   * Prices table renders one column per product directly off the list response (see
   * GuidelinePricesTab.tsx), so there's no separate per-row detail fetch. */
  async findAll(companyId: string): Promise<GuidelinePriceSheet[]> {
    return this.repo.find({
      where: { companyId },
      relations: ['lines', 'lines.product', 'lines.product.brand', 'supplier'],
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<GuidelinePriceSheet> {
    const sheet = await this.repo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.product', 'lines.product.brand', 'supplier'],
    });
    if (!sheet) throw new NotFoundException('Guideline price sheet not found');
    return sheet;
  }

  /** One sheet per company row, all in one transaction — either every row in the submitted batch
   * is created, or none are (a duplicate/invalid row anywhere in the batch rolls the whole save
   * back rather than leaving a partial set of sheets for that month). */
  async create(
    dto: CreateGuidelinePriceSheetDto,
    createdById: string,
    companyId: string,
  ): Promise<GuidelinePriceSheet[]> {
    const supplierIds = dto.companies.map((c) => c.supplierId);
    if (new Set(supplierIds).size !== supplierIds.length) {
      throw new BadRequestException('The same company was selected more than once');
    }

    const existing = await this.repo.find({
      where: { companyId, month: dto.month, year: dto.year, supplierId: In(supplierIds) },
      relations: ['supplier'],
    });
    if (existing.length) {
      throw new BadRequestException(
        `A guideline price sheet already exists for this month for: ${existing.map((s) => s.supplier.companyName).join(', ')}`,
      );
    }

    const sheets = dto.companies.map((c) =>
      this.repo.create({
        companyId,
        month: dto.month,
        year: dto.year,
        supplierId: c.supplierId,
        isAuthorizedAgent: c.isAuthorizedAgent,
        discountPercentage: c.discountPercentage,
        createdById,
        lines: [] as GuidelinePriceLine[],
      }),
    );
    return this.repo.save(sheets);
  }

  async update(id: string, dto: UpdateGuidelinePriceSheetDto, companyId: string): Promise<GuidelinePriceSheet> {
    return this.dataSource.transaction(async (manager) => {
      const sheetRepo = manager.getRepository(GuidelinePriceSheet);
      const lineRepo = manager.getRepository(GuidelinePriceLine);
      const sheet = await sheetRepo.findOne({ where: { id, companyId } });
      if (!sheet) throw new NotFoundException('Guideline price sheet not found');

      if (dto.lines) {
        // Delete-then-recreate — same convention as Quotation's update() since the incoming set of
        // products can freely add/remove/reorder lines with no stable identity to diff against.
        await lineRepo.delete({ sheetId: id });
        sheet.lines = dto.lines.map((line) =>
          lineRepo.create({ sheetId: id, productId: line.productId, price: line.price }),
        );
      }
      if (dto.isAuthorizedAgent !== undefined) sheet.isAuthorizedAgent = dto.isAuthorizedAgent;
      if (dto.discountPercentage !== undefined) sheet.discountPercentage = dto.discountPercentage;
      return sheetRepo.save(sheet);
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    const sheet = await this.findOne(id, companyId);
    await this.repo.remove(sheet);
  }

  /** Powers the Guideline Price detail page's auto-populated product list: every product ever
   * bought from this supplier, each with its most recent real purchase price (free-goods receipts
   * excluded — their price is always forced to 0 and would otherwise mask the real figure if one
   * happened to be the latest receipt). One row per product via DISTINCT ON, latest receipt wins.
   * quantityPurchased is a window-function SUM over every one of that product's receipts from this
   * supplier (same free-goods exclusion — "عدد العبوات المشتراة" means actually paid-for packages,
   * not bonus stock), computed off this same purchase_receipts scan rather than a second query.
   *
   * taxValuePerUnit replaces the old per-product taxRate-based "قيمة الضريبة" — by explicit
   * request, this supplier's real ضريبة المبيعات payments (ac_supplier_tax_payments, recorded from
   * the centralized "الضرائب" tab under الموردون) are spread evenly across every package ever
   * bought from them: (total tax paid to this supplier) ÷ (total packages bought from this
   * supplier, across every product). The SAME per-unit figure is attached to every row here — the
   * tax isn't tracked per product, only per supplier, so there's no more granular number to give
   * any one product than its fair share of the whole. */
  async findSupplierProducts(
    supplierId: string,
    companyId: string,
  ): Promise<
    {
      productId: string;
      sku: string | null;
      nameEn: string;
      nameAr: string | null;
      barcode: string | null;
      brandNameEn: string | null;
      brandNameAr: string | null;
      purchasePrice: number;
      /** The product's own configured PACKAGE/carton selling price ("سعر البيع (المصنع)") — a
       * fixed reference value from the Product record itself, not company/month-specific like
       * the guideline price being set on this page. Deliberately the package price, not the
       * per-unit price, since the factory sells this product to us by the carton. */
      packageSellingPrice: number | null;
      /** Total packages purchased from this supplier across every (non-free-goods) receipt of this
       * product — "عدد العبوات المشتراة" on the detail page's product table. */
      quantityPurchased: number;
      /** This supplier's total tax payments ÷ total packages bought from them — see this method's
       * own doc comment above. Identical across every row returned here. */
      taxValuePerUnit: number;
    }[]
  > {
    const rows: {
      productId: string;
      sku: string | null;
      nameEn: string;
      nameAr: string | null;
      barcode: string | null;
      brandNameEn: string | null;
      brandNameAr: string | null;
      purchasePrice: number;
      packageSellingPrice: number | null;
      quantityPurchased: number;
      totalQuantityFromSupplier: string;
    }[] = await this.dataSource.query(
      `SELECT DISTINCT ON (pr."productId")
         pr."productId"          AS "productId",
         pr."unitCost"           AS "purchasePrice",
         p."sku"                 AS "sku",
         p."nameEn"              AS "nameEn",
         p."nameAr"              AS "nameAr",
         p."barcode"             AS "barcode",
         p."packageSellingPrice" AS "packageSellingPrice",
         b."nameEn"              AS "brandNameEn",
         b."nameAr"              AS "brandNameAr",
         SUM(pr."quantityPackages") OVER (PARTITION BY pr."productId") AS "quantityPurchased",
         SUM(pr."quantityPackages") OVER ()                            AS "totalQuantityFromSupplier"
       FROM purchase_receipts pr
       JOIN products p ON p.id = pr."productId"
       LEFT JOIN brands b ON b.id = p."brandId"
       WHERE pr."supplierId" = $1 AND pr."companyId" = $2 AND pr."isFreeGoods" = false
       ORDER BY pr."productId", pr."receiptDate" DESC, pr."createdAt" DESC`,
      [supplierId, companyId],
    );
    if (rows.length === 0) return [];

    const [{ totalTax }] = await this.dataSource.query(
      `SELECT COALESCE(SUM(amount), 0) AS "totalTax" FROM ac_supplier_tax_payments WHERE "supplierId" = $1 AND "companyId" = $2`,
      [supplierId, companyId],
    );
    const totalQuantityFromSupplier = Number(rows[0].totalQuantityFromSupplier) || 0;
    const taxValuePerUnit = totalQuantityFromSupplier > 0 ? Number(totalTax) / totalQuantityFromSupplier : 0;

    return rows.map(({ totalQuantityFromSupplier: _drop, ...r }) => ({ ...r, taxValuePerUnit }));
  }
}
