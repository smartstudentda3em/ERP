import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Supplier } from "./supplier.entity";
import { PaymentMethod } from "../../../../entities/enums";

@Entity("supplier_payments")
export class SupplierPayment extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  paymentDate: string;

  @Column("uuid")
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  @Column("uuid")
  companyId: string;

  @Column("uuid", { nullable: true })
  branchId: string;

  /** Optional link to the specific receipt this payment settles — omitted for a general payment on account. */
  @Column("uuid", { nullable: true })
  purchaseReceiptId: string;

  @Column({ type: "enum", enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "varchar", length: 100, nullable: true })
  referenceNumber: string;

  @Column("uuid", { nullable: true })
  cashMovementId: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column("uuid")
  createdById: string;
}
