import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Supplier } from "../../parties/suppliers/entities/supplier.entity";
import { Company } from "../../settings/entities/company.entity";

/**
 * Air Conditioning company only — "ضريبة المبيعات" paid to a supplier, logged from the centralized
 * "الضرائب" tab under الموردون; there is no tax-rate/calculation engine here, this is a manual log.
 * Recorded here AND (by explicit request) as a real Cash/Bank treasury debit via
 * CashMovementsService, linked by CashMovement's sourceType=SUPPLIER_TAX_PAYMENT/sourceId=this
 * row's id (see AcSupplierTaxPaymentsService.create()) — mirrors AcSupplierPayment's own dual
 * bookkeeping exactly. supplierId is nullable — a null row is a "ضرائب عامة" (general tax) entry
 * not attributed to any one supplier, the add form's own explicit picklist option for that case
 * (see SupplierTaxesTab.tsx) rather than a placeholder/unset value.
 */
@Entity("ac_supplier_tax_payments")
export class AcSupplierTaxPayment extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid", { nullable: true })
  supplierId: string | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "supplierId" })
  supplier: Supplier | null;

  @Column({ type: "date" })
  taxDate: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column("uuid")
  createdById: string;
}
