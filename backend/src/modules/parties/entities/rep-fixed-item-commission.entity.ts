import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";
import { SalesRepresentative } from "./sales-representative.entity";
import { Product } from "../../inventory/products/entities/product.entity";

/** AC-only: a fixed cash amount a مندوب earns per unit of one specific product they assisted a
 * sale of (SalesInvoice.assistingSalesRepresentativeId), fully replacing the percentage
 * commissionRate/CommissionException model for that رep — mirrors CommissionException's shape,
 * but always per-product (no category tier) and a flat amount rather than a rate. A product with
 * no row here earns this رep nothing, same "unconfigured = not commissionable" convention as an
 * unset commissionRate elsewhere. */
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
  productId: string;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;
}
