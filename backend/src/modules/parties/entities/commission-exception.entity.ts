import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";
import { SalesRepresentative } from "./sales-representative.entity";
import { Product } from "../../inventory/products/entities/product.entity";
import { ProductCategory } from "../../settings/entities/product-category.entity";

/** A per-product or per-category commission override for one branch manager (SalesRepresentative)
 * — exactly one of productId/categoryId is ever set, enforced in SalesRepresentativesService rather
 * than a DB constraint. When set, it takes precedence over the manager's own general commissionRate
 * for any sales invoice line matching that product (or that product's category). */
@Entity("commission_exceptions")
export class CommissionException extends BaseEntity {
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

  @Column("uuid", { nullable: true })
  productId: string;

  @ManyToOne(() => Product, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "productId" })
  product: Product | null;

  @Column("uuid", { nullable: true })
  categoryId: string;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "categoryId" })
  category: ProductCategory | null;

  @Column({ type: "numeric", precision: 7, scale: 4 })
  commissionRate: number;
}
