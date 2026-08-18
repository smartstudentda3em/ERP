import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Product } from "./product.entity";
import { Warehouse } from "../../../settings/entities/warehouse.entity";
import { Company } from "../../../settings/entities/company.entity";

@Entity("product_batches")
export class ProductBatch extends BaseEntity {
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

  @Column({
    type: "varchar",
    length: 100,
  })
  batchNumber: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  serialNumber: string | null;

  @Column({ type: "date", nullable: true })
  expirationDate: string | null;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  quantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  unitCost: number;
}
