import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from './company.entity';

@Entity('branches')
export class Branch extends BaseEntity {
  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  nameEn: string;

  @Column({ length: 200, nullable: true })
  nameAr: string;

  @Column({ length: 300, nullable: true })
  address: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ default: false })
  isMainBranch: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, (company) => company.branches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;
}
