import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";
import { SalesRepresentative } from "./sales-representative.entity";
import { ProductCategory } from "../../settings/entities/product-category.entity";

/** AC-only: a fixed cash amount a مندوب earns per unit sold from one product category (e.g.
 * "تكيفات", "كابول", "خدمات") on an invoice they assisted with
 * (SalesInvoice.assistingSalesRepresentativeId), fully replacing the percentage
 * commissionRate/CommissionException model for that رep. Keyed by category rather than individual
 * product — AC's real catalog runs 20+ SKUs (every brand/model combination) but only a handful of
 * categories, so a category picker is what's actually usable for the admin configuring this. A
 * category with no row here earns this رep nothing, same "unconfigured = not commissionable"
 * convention as an unset commissionRate elsewhere. */
@Entity("rep_fixed_item_commissions")
export class RepFixedItemCommission extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  salesRepresentativeId: string;

  @ManyToOne(() => SalesRepresentative, { onDelete: "CASCADE" })
  @JoinColumn({ name: "salesRepresentativeId" })
  salesRepresentative: SalesRepresentative;

  @Column("uuid")
  categoryId: string;

  @ManyToOne(() => ProductCategory, { onDelete: "CASCADE" })
  @JoinColumn({ name: "categoryId" })
  category: ProductCategory;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;
}
