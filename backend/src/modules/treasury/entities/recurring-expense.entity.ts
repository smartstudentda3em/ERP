import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { CashMovementAccount } from '../../../entities/enums';
import { Company } from '../../settings/entities/company.entity';

/**
 * A template for a monthly-recurring operating expense (rent, salaries, ...). Doesn't hold any
 * money itself — RecurringExpensesService's cron job reads active rows here once a month and
 * records a real CashMovement (EXPENSE, MANUAL) from each one, exactly as if the user had entered
 * it by hand on the 1st.
 */
@Entity('recurring_expenses')
export class RecurringExpense extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  /** Matches CashMovement.category — the ExpenseCategory's name, copied as free text (not an FK), same as a manually-entered expense. */
  @Column({ length: 100 })
  category: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  amount: number;

  @Column({ type: 'enum', enum: CashMovementAccount })
  account: CashMovementAccount;

  @Column({ type: 'varchar', length: 300, nullable: true })
  description: string | null;

  /** false = cancelled by the user; the cron job skips it but the row (and its history) stays. */
  @Column({ default: true })
  isActive: boolean;

  /** 'YYYY-MM' of the last period this template generated a CashMovement for — guards against double-generation if the cron fires more than once in the same month. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  lastGeneratedPeriod: string | null;

  @Column('uuid')
  createdById: string;
}
