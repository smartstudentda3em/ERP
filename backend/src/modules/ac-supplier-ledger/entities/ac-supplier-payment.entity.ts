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

  @Column("uuid")
  createdById: string;
}
