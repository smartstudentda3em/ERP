import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from './company.entity';

/**
 * A free-text-free classification for operating expenses (Rent, Electricity, Salaries, ...).
 * Managed centrally under Settings > Expense Categories so the Expenses screen offers a
 * dropdown instead of letting every entry drift into slightly different spellings.
 */
@Entity('expense_categories')
export class ExpenseCategory extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ length: 150 })
  nameEn: string;

  @Column({ length: 150, nullable: true })
  nameAr: string;

  @Column({ default: true })
  isActive: boolean;
}
