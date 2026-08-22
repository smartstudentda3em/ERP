import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Supplier } from "../../parties/suppliers/entities/supplier.entity";
import { Company } from "../../settings/entities/company.entity";

/**
 * Air Conditioning company only — a supplier debt payment recorded here AND (by explicit request)
 * as a real Cash/Bank treasury debit via CashMovementsService, linked by CashMovement's
 * sourceType=SUPPLIER_PAYMENT/sourceId=this row's id (see AcSupplierPaymentsService.create()).
 * Deliberately NOT the pre-existing SupplierPayment entity (used everywhere else in this system)
 * — that one carries its own documentNumber/purchaseReceiptId ledger; this one exists specifically
 * for AcSupplierDetailPage.tsx's "دفعات المورد" tab and its own independent running balance, which
 * a purchase receipt's "رصيد المورد" payment source (see PurchaseReceiptsService) can later consume
 * via a NEGATIVE row here (AcSupplierPaymentsService.deductForPurchase) — that internal path is the
 * one part of this ledger that still never touches the treasury, since it never moves new money.
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
