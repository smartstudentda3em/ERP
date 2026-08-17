import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Product } from "./product.entity";
import { Company } from "../../../settings/entities/company.entity";

/** One line of a Kit product's bill-of-materials — see ProductKitsService for how these get
 * exploded into real stock movements on the component products. AC company only. */
@Entity("product_components")
@Unique(["parentProductId", "componentProductId"])
export class ProductComponent extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  /** The kit product (Product.isKit === true). */
  @Column("uuid")
  parentProductId: string;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "parentProductId" })
  parentProduct: Product;

  /** The real, independently-stocked part. RESTRICT — a component wired into a kit can't be
   * deleted out from under it. */
  @Column("uuid")
  componentProductId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "componentProductId" })
  componentProduct: Product;

  /** Units of this component consumed/received per 1 unit of the parent kit. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;
}
