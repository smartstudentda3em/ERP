import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Warehouse } from "../../../settings/entities/warehouse.entity";
import { Product } from "../../products/entities/product.entity";
import { DocumentStatus } from "../../../../entities/enums";
import { Company } from "../../../settings/entities/company.entity";

@Entity("stock_adjustments")
@Unique(["companyId", "documentNumber"])
export class StockAdjustment extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 50,
  })
  documentNumber: string;

  @Column({ type: "date" })
  adjustmentDate: string;

  @Column("uuid")
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouseId" })
  warehouse: Warehouse;

  @Column({ type: "text", nullable: true })
  reason: string | null;

  @Column({ type: "enum", enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => StockAdjustmentLine, (line) => line.adjustment, {
    cascade: true,
  })
  lines: StockAdjustmentLine[];
}

@Entity("stock_adjustment_lines")
export class StockAdjustmentLine extends BaseEntity {
  @Column("uuid")
  adjustmentId: string;

  @ManyToOne(() => StockAdjustment, (adj) => adj.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "adjustmentId" })
  adjustment: StockAdjustment;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  systemQuantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  countedQuantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitCost: number;
}
