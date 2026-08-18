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

@Entity("stock_transfers")
@Unique(["companyId", "documentNumber"])
export class StockTransfer extends BaseEntity {
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
  transferDate: string;

  @Column("uuid")
  fromWarehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "fromWarehouseId" })
  fromWarehouse: Warehouse;

  @Column("uuid")
  toWarehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "toWarehouseId" })
  toWarehouse: Warehouse;

  @Column({ type: "enum", enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => StockTransferLine, (line) => line.transfer, {
    cascade: true,
  })
  lines: StockTransferLine[];
}

@Entity("stock_transfer_lines")
export class StockTransferLine extends BaseEntity {
  @Column("uuid")
  transferId: string;

  @ManyToOne(() => StockTransfer, (t) => t.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "transferId" })
  transfer: StockTransfer;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;
}
