import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { InstallmentPlan } from "./installment-plan.entity";

/**
 * One month's due row. Deliberately has NO stored `amountPaid`/`status` column — following this
 * codebase's "compute live from the ledger, never cache" rule (same as Customer.balanceDue and
 * SalesInvoice.amountPaid reconciliation), the paid amount and status (PENDING/PARTIALLY_PAID/
 * PAID/OVERDUE) are derived at read time by InstallmentPlansService by summing the
 * InstallmentPayment rows linked to this item's id.
 */
@Entity("installment_schedule_items")
export class InstallmentScheduleItem extends BaseEntity {
  @Column("uuid")
  installmentPlanId: string;

  @ManyToOne(() => InstallmentPlan, { onDelete: "CASCADE" })
  @JoinColumn({ name: "installmentPlanId" })
  installmentPlan: InstallmentPlan;

  @Column("int")
  installmentNumber: number;

  @Column({ type: "date" })
  dueDate: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  principalPortion: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  interestPortion: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amountDue: number;
}
