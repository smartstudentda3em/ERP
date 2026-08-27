import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Unique } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Product } from "../../../inventory/products/entities/product.entity";
import { Company } from "../../../settings/entities/company.entity";
import { Supplier } from "../../../parties/suppliers/entities/supplier.entity";

/** One "price sheet" per calendar month per supplier company — AC-only (see
 * GuidelinePricesTab.tsx's isAirConditioning gate; there is no backend-side company check, same
 * convention as the Installments module, which is also AC-only and relies purely on frontend
 * gating + normal companyId scoping). The unique constraint is the sheet's real identity:
 * month/year/supplier are immutable after creation — everything else (lines, isAuthorizedAgent,
 * discountPercentage) can be edited independently (see UpdateGuidelinePriceSheetDto). `lines`
 * starts empty at creation — the "add" flow's first step only captures this header data (supplier,
 * agent status, discount); models/prices are filled in afterwards via the detail page. */
@Entity("guideline_price_sheets")
@Unique(["companyId", "year", "month", "supplierId"])
export class GuidelinePriceSheet extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({ type: "smallint" })
  month: number;

  @Column({ type: "smallint" })
  year: number;

  @Column("uuid")
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  @Column({ type: "boolean", default: false })
  isAuthorizedAgent: boolean;

  @Column({ type: "numeric", precision: 5, scale: 2, default: 0 })
  discountPercentage: number;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => GuidelinePriceLine, (line) => line.sheet, { cascade: true })
  lines: GuidelinePriceLine[];
}

@Entity("guideline_price_lines")
export class GuidelinePriceLine extends BaseEntity {
  @Column("uuid")
  sheetId: string;

  @ManyToOne(() => GuidelinePriceSheet, (s) => s.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sheetId" })
  sheet: GuidelinePriceSheet;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  price: number;
}

/** "سعر الكابولي" — Air Conditioning only. Deliberately NOT a per-product-line field (unlike
 * GuidelinePriceLine.price): by explicit request, one caboly price is shared across every product
 * of the same القدرة (capacity — the same Product.barcode field GuidelinePricesService's own
 * findSupplierProducts() already returns) bought from the same supplier, so setting it once for
 * "شركة فريش" + "1.5 حصان" applies to every product on that sheet with that exact capacity. Upsert
 * by (companyId, supplierId, capacity) — see AcCabolyPricesService.upsert().
 */
@Entity("ac_caboly_prices")
@Unique(["companyId", "supplierId", "capacity"])
export class AcCabolyPrice extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: "CASCADE" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  @Column({ type: "varchar", length: 100 })
  capacity: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  price: number;

  @Column("uuid")
  createdById: string;
}
