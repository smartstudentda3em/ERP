import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Company } from '../../../settings/entities/company.entity';
import { Currency } from '../../../settings/entities/currency.entity';

@Entity('suppliers')
export class Supplier extends BaseEntity {
  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  companyName: string;

  @Column({ length: 150, nullable: true })
  contactPerson: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 30, nullable: true })
  mobile: string;

  @Column({ length: 150, nullable: true })
  email: string;

  @Column({ length: 300, nullable: true })
  address: string;

  @Column({ length: 100, nullable: true })
  taxNumber: string;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  openingBalance: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ default: true })
  isActive: boolean;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column('uuid', { nullable: true })
  glAccountId: string | null;

  /** The currency this supplier is billed/quoted in — read by the Cargo/Goods import form so a
   * selected supplier's currency auto-fills there instead of being re-entered per purchase. */
  @Column('uuid', { nullable: true })
  currencyId: string | null;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency | null;
}
