import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from './company.entity';

@Entity('product_categories')
export class ProductCategory extends BaseEntity {
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

  @Column('uuid', { nullable: true })
  parentId: string | null;

  @ManyToOne(() => ProductCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parentId' })
  parent: ProductCategory | null;

  @Column({ default: true })
  isActive: boolean;
}
