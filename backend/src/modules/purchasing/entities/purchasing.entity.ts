import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Supplier } from "../../parties/suppliers/entities/supplier.entity";
import { Product } from "../../inventory/products/entities/product.entity";
import { Warehouse } from "../../settings/entities/warehouse.entity";
import { DocumentStatus } from "../../../entities/enums";

/**
 * Purchasing module is scaffolded (schema + stub API) in this pass — see docs/ROADMAP.md.
 * Entities mirror the Sales module shape so a future pass can implement the module the same way.
 */

@Entity("purchase_requests")
export class PurchaseRequest extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  requestDate: string;

  @Column({ type: "enum", enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => PurchaseRequestLine, (l) => l.request, { cascade: true })
  lines: PurchaseRequestLine[];
}

@Entity("purchase_request_lines")
export class PurchaseRequestLine extends BaseEntity {
  @Column("uuid")
  requestId: string;

  @ManyToOne(() => PurchaseRequest, (r) => r.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "requestId" })
  request: PurchaseRequest;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;
}

@Entity("purchase_orders")
export class PurchaseOrder extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  orderDate: string;

  @Column("uuid")
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  @Column({ type: "enum", enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  grandTotal: number;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => PurchaseOrderLine, (l) => l.order, { cascade: true })
  lines: PurchaseOrderLine[];
}

@Entity("purchase_order_lines")
export class PurchaseOrderLine extends BaseEntity {
  @Column("uuid")
  orderId: string;

  @ManyToOne(() => PurchaseOrder, (o) => o.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "orderId" })
  order: PurchaseOrder;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitCost: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  lineTotal: number;
}

@Entity("goods_receipts")
export class GoodsReceipt extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  receiptDate: string;

  @Column("uuid")
  purchaseOrderId: string;

  @ManyToOne(() => PurchaseOrder, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "purchaseOrderId" })
  purchaseOrder: PurchaseOrder;

  @Column("uuid")
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouseId" })
  warehouse: Warehouse;

  @Column({
    type: "enum",
    enum: DocumentStatus,
    default: DocumentStatus.CONFIRMED,
  })
  status: DocumentStatus;

  @Column("uuid")
  createdById: string;
}

@Entity("purchase_invoices")
export class PurchaseInvoice extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  invoiceDate: string;

  @Column("uuid")
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  @Column({ type: "enum", enum: DocumentStatus, default: DocumentStatus.DRAFT })
  status: DocumentStatus;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  grandTotal: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  amountPaid: number;

  @Column("uuid", { nullable: true })
  journalEntryId: string;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => PurchaseInvoiceLine, (l) => l.invoice, { cascade: true })
  lines: PurchaseInvoiceLine[];
}

@Entity("purchase_invoice_lines")
export class PurchaseInvoiceLine extends BaseEntity {
  @Column("uuid")
  invoiceId: string;

  @ManyToOne(() => PurchaseInvoice, (i) => i.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoiceId" })
  invoice: PurchaseInvoice;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitCost: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  lineTotal: number;
}

@Entity("purchase_payments")
export class PurchasePayment extends BaseEntity {
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

  @Column("uuid", { nullable: true })
  invoiceId: string;

  @ManyToOne(() => PurchaseInvoice, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "invoiceId" })
  invoice: PurchaseInvoice | null;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column("uuid", { nullable: true })
  journalEntryId: string;

  @Column("uuid")
  createdById: string;
}

@Entity("supplier_returns")
export class SupplierReturn extends BaseEntity {
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

  @ManyToOne(() => PurchaseInvoice, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "invoiceId" })
  invoice: PurchaseInvoice;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  grandTotal: number;

  @Column("uuid")
  createdById: string;
}
