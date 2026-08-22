import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Supplier } from "../../parties/suppliers/entities/supplier.entity";
import { Company } from "../../settings/entities/company.entity";

/**
 * Air Conditioning company only — a supplier debt payment recorded as a pure bookkeeping entry.
 * Deliberately NOT the pre-existing SupplierPayment entity (used everywhere else in this system),
 * which always debits a Cash/Bank treasury account via CashMovementsService — this one never
 * touches the treasury at all, by explicit design (see AcSupplierDetailPage.tsx's "تسجيل دفعة"
 * modal, which has no payment-method field for exactly this reason). Standalone: this module has
 * no dependency on TreasuryModule/CashMovementsService.
 */
@Entity("ac_supplier_payments")
export class AcSupplierPayment extends BaseEntity {
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

  @Column({ type: "date" })
  paymentDate: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  /** Set only on a row auto-inserted by PurchaseReceiptsService when an AC purchase is paid via
   * "رصيد المورد" (a NEGATIVE amount consuming this ledger's balance) — lets that same purchase
   * receipt's later edit/delete find and remove exactly this row (see
   * AcSupplierPaymentsService.removeByPurchaseReceipt). No FK/relation to PurchaseReceipt on
   * purpose, mirroring CashMovement's sourceType/sourceId pattern — keeps this module fully
   * decoupled from the inventory module at the entity level. Null for every normal, user-entered
   * payment row. */
  @Column({ type: "uuid", nullable: true })
  purchaseReceiptId: string | null;

  @Column("uuid")
  createdById: string;
}
