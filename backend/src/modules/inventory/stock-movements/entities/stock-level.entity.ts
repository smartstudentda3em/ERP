import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Product } from "../../products/entities/product.entity";
import { Warehouse } from "../../../settings/entities/warehouse.entity";
import { Company } from "../../../settings/entities/company.entity";

@Entity("stock_levels")
@Unique(["productId", "warehouseId"])
export class StockLevel extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "CASCADE" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column("uuid")
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "CASCADE" })
  @JoinColumn({ name: "warehouseId" })
  warehouse: Warehouse;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  quantityOnHand: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  reservedQuantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  averageCost: number;

  @Column({ type: "varchar", length: 50, nullable: true })
  location: string | null;
}
