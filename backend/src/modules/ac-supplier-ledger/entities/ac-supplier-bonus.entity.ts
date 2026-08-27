import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Supplier } from "../../parties/suppliers/entities/supplier.entity";
import { Company } from "../../settings/entities/company.entity";

/**
 * Air Conditioning company only — a monetary bonus/rebate granted BY a supplier (e.g. a target
 * discount credited in cash terms rather than in-kind goods — see PurchaseReceipt.isFreeGoods for
 * the in-kind equivalent), logged from AcSupplierDetailPage.tsx's "البونص" tab. Deliberately never
 * touches Cash/Bank — unlike AcSupplierPayment/AcSupplierTaxPayment, this never posts a
 * CashMovement, since no real money actually moves; it only reduces what the company still owes
 * the supplier (see AcSupplierDetailPage.tsx's "الرصيد المتبقي الفعلي" and "إجمالي الفواتير بعد
 * البونص" calculations).
 */
@Entity("ac_supplier_bonuses")
export class AcSupplierBonus extends BaseEntity {
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
  bonusDate: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column("uuid")
  createdById: string;
}
