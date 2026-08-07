import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Company } from './company.entity';
import { ProductCategory } from './product-category.entity';

/**
 * A packaging tier a product can be bought/sold in (Carton, Bundle, Packet, Roll, Bag, Box,
 * Piece, ...). Managed centrally under Settings > Packages so it stays a single source of truth
 * across every product, rather than free text entered per product.
 */
@Entity('package_types')
export class PackageType extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column({ length: 150 })
  nameEn: string;

  @Column({ length: 150, nullable: true })
  nameAr: string;

  /** Optional short abbreviation (e.g. CTN, PKT). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  code: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  // Every package type belongs to exactly one product category — drives the dependent package
  // dropdown on the product create/edit forms, same pattern as Brand.categoryId.
  @Column('uuid')
  categoryId: string;

  @ManyToOne(() => ProductCategory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'categoryId' })
  category: ProductCategory;

  @Column({ default: true })
  isActive: boolean;
}
