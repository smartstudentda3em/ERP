import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { ProductCategory } from "../../../settings/entities/product-category.entity";
import { Brand } from "../../../settings/entities/brand.entity";
import { Unit } from "../../../settings/entities/unit.entity";
import { PackageType } from "../../../settings/entities/package-type.entity";
import { Tax } from "../../../settings/entities/tax.entity";
import { Company } from "../../../settings/entities/company.entity";
import { ProductType } from "../../../../entities/enums";

// sku/barcode uniqueness is enforced in ProductsService (assertSkuBarcodeUnique), not here as a DB
// constraint — Postgres partial indexes can't reference another table (companies), so excluding
// just the AC company from the rule can't be expressed as a schema-level constraint. Every company
// except AC still gets a real duplicate rejection; AC's "القدرة" (barcode) and SKU legitimately
// repeat across a split unit's indoor/outdoor halves.
@Entity("products")
export class Product extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({ type: "varchar", length: 100, nullable: true })
  sku: string | null;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
  })
  barcode: string;

  /** Indexed — the Products search bar matches this with ILIKE, so lookups stay fast as the catalog grows. */
  @Index()
  @Column({
    type: "varchar",
    length: 200,
  })
  nameEn: string;

  @Column({
    type: "varchar",
    length: 200,
    nullable: true,
  })
  nameAr: string;

  /** Indexed — Postgres doesn't auto-index FK columns, and the search bar joins through this to match by category name. */
  @Index()
  @Column("uuid", { nullable: true })
  categoryId: string | null;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "categoryId" })
  category: ProductCategory | null;

  /** Indexed — same reasoning as categoryId, for the search bar's brand-name join. */
  @Index()
  @Column("uuid", { nullable: true })
  brandId: string | null;

  @ManyToOne(() => Brand, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "brandId" })
  brand: Brand | null;

  @Column("uuid")
  unitId: string;

  @ManyToOne(() => Unit, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "unitId" })
  unit: Unit;

  /** Packaging tier (e.g. Carton, Bundle, Packet) — mandatory; every product is defined by a package, sourced from Settings > Packages. */
  @Column("uuid")
  packageTypeId: string;

  @ManyToOne(() => PackageType, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "packageTypeId" })
  packageType: PackageType;

  /** How many base units (`unit`) make up one package (`packageType`). */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitsPerPackage: number;

  /**
   * Purchase price for the whole package. Products are defined (Stage 1) without a price — this
   * is only ever set/refreshed by a Purchase Receipt (Stage 2), so it stays null until the
   * product's first receipt.
   */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  packagePurchasePrice: number | null;

  /** Suggested selling price for the whole package — set/refreshed by Purchase Receipts, editable independently of the unit selling price. */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  packageSellingPrice: number | null;

  /**
   * Purchase price per base unit — always auto-derived (packagePurchasePrice / unitsPerPackage)
   * whenever a Purchase Receipt sets packagePurchasePrice. Never entered directly by the client.
   */
  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  purchasePrice: number;

  /** Suggested selling price per base unit — set/refreshed by Purchase Receipts, editable independently of the package selling price. */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  sellingPrice: number | null;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  wholesalePrice: number;

  @Column("uuid", { nullable: true })
  taxId: string | null;

  @ManyToOne(() => Tax, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "taxId" })
  tax: Tax | null;

  @Column({ type: "numeric", precision: 7, scale: 4, default: 0 })
  discountPercent: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  reorderLevel: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  minimumQuantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  maximumQuantity: number | null;

  @Column({
    type: "varchar",
    length: 500,
    nullable: true,
  })
  imageUrl: string;

  @Column({
    type: "boolean",
    default: false,
  })
  tracksExpiry: boolean;

  @Column({
    type: "boolean",
    default: false,
  })
  tracksBatch: boolean;

  @Column({
    type: "boolean",
    default: false,
  })
  tracksSerial: boolean;

  @Column({ type: "numeric", precision: 10, scale: 3, nullable: true })
  weight: number | null;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  color: string;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  size: string;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  averageCost: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;

  /** Defaults to RAW_MATERIAL for every existing row and every other company — only the Printing
   * Press "المنتجات" catalog screen ever creates CATALOG_ITEM rows (see ProductsService.createCatalogItem). */
  @Column({
    type: "enum",
    enum: ProductType,
    default: ProductType.RAW_MATERIAL,
  })
  productType: ProductType;

  /** Printing Press raw materials only — when true, this raw material (e.g. a stamp) also appears
   * in the sales invoice/quotation item picker alongside catalog items, and selling it deducts
   * real warehouse stock like any other raw material. Meaningless for CATALOG_ITEM rows, which
   * never carry real stock. */
  @Column({
    type: "boolean",
    default: false,
  })
  isSellable: boolean;
}
