import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Supplier } from "../../parties/suppliers/entities/supplier.entity";
import { Company } from "../../settings/entities/company.entity";
import { PurchaseReceipt } from "../../inventory/stock-movements/entities/purchase-receipt.entity";

/**
 * Air Conditioning company only — "ضريبة المبيعات" paid to a supplier, logged invoice by invoice.
 * purchaseReceiptId is optional context linking a tax entry to the purchase it relates to; there is
 * no tax-rate/calculation engine here, this is a manual log. Deliberately not a CashMovement — kept
 * independent of the treasury so it can be totalled for a period on its own.
 */
@Entity("ac_supplier_tax_payments")
export class AcSupplierTaxPayment extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier;

  @Column("uuid", { nullable: true })
  purchaseReceiptId: string | null;

  @ManyToOne(() => PurchaseReceipt, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "purchaseReceiptId" })
  purchaseReceipt: PurchaseReceipt | null;

  @Column({ type: "date" })
  taxDate: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column("uuid")
  createdById: string;
}
