import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from './company.entity';

@Entity('taxes')
export class Tax extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ length: 50 })
  code: string;

  @Column({ length: 150 })
  nameEn: string;

  @Column({ length: 150, nullable: true })
  nameAr: string;

  @Column({ type: 'numeric', precision: 7, scale: 4 })
  rate: number; // percentage, e.g. 14.0000

  @Column({ default: false })
  isWithholding: boolean;

  @Column({ default: true })
  isActive: boolean;
}
