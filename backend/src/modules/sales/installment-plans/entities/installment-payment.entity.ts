import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { InstallmentPlan } from './installment-plan.entity';
import { InstallmentScheduleItem } from './installment-schedule-item.entity';
import { InstallmentPaymentType, PaymentMethod } from '../../../../entities/enums';

/** Mirrors SalesPayment. `scheduleItemId` is null only for an EARLY_SETTLEMENT lump sum, which
 * closes out the whole plan at once rather than one specific month. */
@Entity('installment_payments')
export class InstallmentPayment extends BaseEntity {
  @Column({ length: 50, unique: true })
  documentNumber: string;

  @Column('uuid')
  installmentPlanId: string;

  @ManyToOne(() => InstallmentPlan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'installmentPlanId' })
  installmentPlan: InstallmentPlan;

  @Column('uuid', { nullable: true })
  scheduleItemId: string | null;

  @ManyToOne(() => InstallmentScheduleItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scheduleItemId' })
  scheduleItem: InstallmentScheduleItem | null;

  @Column({ type: 'enum', enum: InstallmentPaymentType, default: InstallmentPaymentType.INSTALLMENT })
  paymentType: InstallmentPaymentType;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  amount: number;

  /** How much of this specific payment was principal vs. interest, computed and stored once at
   * payment time (a historical fact about the payment itself, not a live balance) — this is what
   * makes the interest-profit report accurate for early settlements too, where the split can't be
   * reconstructed later from the schedule items alone. Zero interest for a DOWN_PAYMENT. */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  principalAllocated: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  interestAllocated: number;

  @Column({ type: 'date' })
  paymentDate: string;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column('uuid', { nullable: true })
  cashMovementId: string | null;

  @Column('uuid')
  companyId: string;

  @Column('uuid')
  createdById: string;
}
