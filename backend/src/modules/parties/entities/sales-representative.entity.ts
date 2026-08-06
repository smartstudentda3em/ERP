import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from '../../settings/entities/company.entity';
import { User } from '../../users/entities/user.entity';
import { Branch } from '../../settings/entities/branch.entity';

@Entity('sales_representatives')
export class SalesRepresentative extends BaseEntity {
  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 30, nullable: true })
  phone: string;

  @Column({ length: 150, nullable: true })
  email: string;

  /** Legacy free-text field, kept for backward compatibility — the add/edit form now uses the
   * proper `branchId` select below instead of typing this in by hand. */
  @Column({ length: 150, nullable: true })
  territory: string;

  /** Links this salesperson to one of the company's configured branches (Settings > Branches) —
   * optional, matching the legacy territory field's own nullability. */
  @Column('uuid', { nullable: true })
  branchId: string | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch | null;

  @Column({ type: 'numeric', precision: 7, scale: 4, default: 0 })
  commissionRate: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  monthlyTarget: number;

  @Column({ default: true })
  isActive: boolean;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  /** Links this rep to their login account, so quotations/invoices/payments they're assigned to can be scoped by permissions. */
  @Column('uuid', { nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;
}
