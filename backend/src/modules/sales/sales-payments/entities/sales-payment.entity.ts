import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Customer } from "../../../parties/customers/entities/customer.entity";
import { SalesInvoice } from "../../sales-invoices/entities/sales-invoice.entity";
import { SalesRepresentative } from "../../../parties/entities/sales-representative.entity";
import { PaymentMethod, CashMovementAccount } from "../../../../entities/enums";

@Entity("sales_payments")
export class SalesPayment extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  paymentDate: string;

  /** Nullable — Printing Press receipts (see CreateSalesPaymentDto) never carry a customer. */
  @Column("uuid", { nullable: true })
  customerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: "RESTRICT" })
  @JoinColumn({ name: "customerId" })
  customer: Customer | null;

  @Column("uuid")
  companyId: string;

  @Column("uuid", { nullable: true })
  branchId: string | null;

  @Column("uuid", { nullable: true })
  invoiceId: string | null;

  @ManyToOne(() => SalesInvoice, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "invoiceId" })
  invoice: SalesInvoice | null;

  @Column("uuid", { nullable: true })
  salesRepresentativeId: string | null;

  @ManyToOne(() => SalesRepresentative, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "salesRepresentativeId" })
  salesRepresentative: SalesRepresentative | null;

  @Column({ type: "enum", enum: PaymentMethod })
  method: PaymentMethod;

  /** Which treasury account this receipt actually settled into (CASH/BANK) — resolved and
   * persisted at create() time (see SalesPaymentsService), so the Printing Press receipts table
   * can show it as its own "الحساب" column without a join to the linked CashMovement. */
  @Column({ type: "enum", enum: CashMovementAccount, nullable: true })
  paymentAccount: CashMovementAccount | null;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column("uuid", { nullable: true })
  cashBoxId: string | null;

  @Column("uuid", { nullable: true })
  bankAccountId: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  referenceNumber: string | null;

  @Column("uuid", { nullable: true })
  cashMovementId: string | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column("uuid")
  createdById: string;
}
