import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Customer } from "../../../parties/customers/entities/customer.entity";
import { Product } from "../../../inventory/products/entities/product.entity";
import { Company } from "../../../settings/entities/company.entity";
import { Branch } from "../../../settings/entities/branch.entity";
import { Warehouse } from "../../../settings/entities/warehouse.entity";
import { SalesRepresentative } from "../../../parties/entities/sales-representative.entity";
import {
  SalesDocumentStatus,
  SaleUnitKind,
  CashMovementAccount,
} from "../../../../entities/enums";
import { SalesOrder } from "../../sales-orders/entities/sales-order.entity";

@Entity("sales_invoices")
export class SalesInvoice extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  invoiceDate: string;

  @Column({ type: "date", nullable: true })
  dueDate: string;

  @Column("uuid")
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customerId" })
  customer: Customer;

  @Column("uuid", { nullable: true })
  salesOrderId: string;

  @ManyToOne(() => SalesOrder, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "salesOrderId" })
  salesOrder: SalesOrder | null;

  @Column("uuid")
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouseId" })
  warehouse: Warehouse;

  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid", { nullable: true })
  branchId: string;

  @ManyToOne(() => Branch, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "branchId" })
  branch: Branch | null;

  @Column("uuid", { nullable: true })
  salesRepresentativeId: string;

  @ManyToOne(() => SalesRepresentative, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "salesRepresentativeId" })
  salesRepresentative: SalesRepresentative | null;

  /** Printing Press only — free-text customer identity captured directly on the invoice, since
   * Press invoices are always attributed to the single seeded WALKIN customer rather than a real
   * customer record (see customerId above). Not linked to the Customer table. */
  @Column({ type: "varchar", length: 200, nullable: true })
  customerName: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  customerPhone: string;

  /** Printing Press only — which treasury account (cash/bank) an upfront payment settles into.
   * Persisted here (not just used transiently to build the CashMovement) so it can be shown as an
   * invoice table column. */
  @Column({ type: "enum", enum: CashMovementAccount, nullable: true })
  paymentAccount: CashMovementAccount | null;

  @Column({
    type: "varchar",
    length: 10,
    default: "USD",
  })
  currencyCode: string;

  @Column({ type: "numeric", precision: 18, scale: 6, default: 1 })
  exchangeRate: number;

  @Column({
    type: "enum",
    enum: SalesDocumentStatus,
    default: SalesDocumentStatus.DRAFT,
  })
  status: SalesDocumentStatus;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  subtotal: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  grandTotal: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  amountPaid: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  costOfGoodsSold: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  totalProfit: number;

  @Column("uuid", { nullable: true })
  journalEntryId: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => SalesInvoiceLine, (line) => line.invoice, { cascade: true })
  lines: SalesInvoiceLine[];
}

@Entity("sales_invoice_lines")
export class SalesInvoiceLine extends BaseEntity {
  @Column("uuid")
  invoiceId: string;

  @ManyToOne(() => SalesInvoice, (inv) => inv.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoiceId" })
  invoice: SalesInvoice;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  /** Which unit `quantity`/`unitPrice` are expressed in — the product's base unit, or its package tier. */
  @Column({ type: "enum", enum: SaleUnitKind, default: SaleUnitKind.UNIT })
  unitKind: SaleUnitKind;

  /** Quantity sold, expressed in `unitKind` (e.g. "2" cartons, or "5" pieces). */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;

  /** `quantity` converted to base units (× Product.unitsPerPackage when unitKind is PACKAGE) — what actually leaves stock. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  baseQuantity: number;

  /** Actual selling price entered by the user, per `unitKind` — fully editable, never constrained by the suggested price. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitPrice: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  lineTotal: number;

  /** Weighted-average stock cost per base unit at the moment of sale (drives COGS; always per base unit regardless of unitKind). */
  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  unitCost: number;

  /** Snapshot of the product's purchase cost, per `unitKind` — never affected by later price changes. */
  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  purchasePrice: number;

  /** Snapshot of the product's suggested selling price, per `unitKind` — reference only. */
  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  suggestedPrice: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  profitPerUnit: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  totalProfit: number;
}

@Entity("sales_returns")
export class SalesReturn extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  returnDate: string;

  @Column("uuid")
  invoiceId: string;

  @ManyToOne(() => SalesInvoice, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoiceId" })
  invoice: SalesInvoice;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  grandTotal: number;

  @Column("uuid", { nullable: true })
  journalEntryId: string;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => SalesReturnLine, (line) => line.salesReturn, {
    cascade: true,
  })
  lines: SalesReturnLine[];
}

@Entity("sales_return_lines")
export class SalesReturnLine extends BaseEntity {
  @Column("uuid")
  salesReturnId: string;

  @ManyToOne(() => SalesReturn, (r) => r.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "salesReturnId" })
  salesReturn: SalesReturn;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitPrice: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  lineTotal: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  unitCost: number;
}
