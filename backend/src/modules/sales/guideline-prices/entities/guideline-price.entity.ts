import { Column, Entity, JoinColumn, ManyToOne, OneToMany, Unique } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Product } from "../../../inventory/products/entities/product.entity";
import { Company } from "../../../settings/entities/company.entity";

/** One "price sheet" per calendar month — AC-only (see GuidelinePricesTab.tsx's isAirConditioning
 * gate; there is no backend-side company check, same convention as the Installments module, which
 * is also AC-only and relies purely on frontend gating + normal companyId scoping). The unique
 * constraint is the sheet's real identity: month/year are immutable after creation, only `lines`
 * can be edited (see UpdateGuidelinePriceSheetDto). */
@Entity("guideline_price_sheets")
@Unique(["companyId", "year", "month"])
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
