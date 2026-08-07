import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from '../../settings/entities/company.entity';
import { Branch } from '../../settings/entities/branch.entity';
import { User } from '../../users/entities/user.entity';

/**
 * "الموظفين" — applies to every company/branch, not just Printing Press. `branchId` is required
 * (not nullable like SalesRepresentative.branchId) since it's what payroll approval uses to
 * allocate the posted salary expense to the right branch — see PayrollService.approve().
 */
@Entity('employees')
export class Employee extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column('uuid')
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 150 })
  jobTitle: string;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  baseSalary: number;

  @Column({ default: true })
  isActive: boolean;

  /** Links this employee row to their own login account, when one exists — set automatically by
   * UsersService.syncBranchManagerEmployee() whenever a "مدير فرع" user is saved with a branch, the
   * same way SalesRepresentative.userId is auto-linked. Lets a logged-in branch manager's own
   * payroll data be resolved server-side from their JWT instead of a client-supplied id. */
  @Column('uuid', { nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;
}
