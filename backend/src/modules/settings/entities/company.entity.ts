import { Column, Entity, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Branch } from './branch.entity';

@Entity('companies')
export class Company extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 200 })
  nameEn: string;

  @Column({ length: 200, nullable: true })
  nameAr: string;

  @Column({ length: 100, nullable: true })
  taxNumber: string;

  @Column({ length: 300, nullable: true })
  address: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ length: 150, nullable: true })
  email: string;

  @Column({ length: 300, nullable: true })
  logoUrl: string;

  @Column({ length: 10, default: 'USD' })
  baseCurrencyCode: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: true })
  warnOnSellBelowCost: boolean;

  @OneToMany(() => Branch, (branch) => branch.company)
  branches: Branch[];
}
