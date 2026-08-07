import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from './company.entity';
import { Branch } from './branch.entity';

/**
 * An equity partner and their ownership share — managed under Settings > Partners, independently
 * per company (each of the businesses sharing this system has its own ownership/partners). The
 * combined sharePercentage is enforced (by PartnersService) to never exceed 100% within its own
 * scope — company-wide for every company, except Printing Press where `branchId` splits the cap
 * table per branch instead (see `branchId` below).
 */
@Entity('partners')
export class Partner extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'numeric', precision: 5, scale: 2 })
  sharePercentage: number;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Printing Press only — which branch this partner's `sharePercentage` applies to. The same
   * person can appear as multiple Partner rows (same name, different `branchId`) to hold a
   * different ownership share in each branch; every other company leaves this null and keeps a
   * single company-wide share, exactly as before. Null, not a shared "no branch" partner — 100%
   * caps and dividend math group strictly by this column.
   */
  @Column('uuid', { nullable: true })
  branchId: string | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch | null;
}
