import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Product } from '../../products/entities/product.entity';
import { Warehouse } from '../../../settings/entities/warehouse.entity';
import { StockMovementType } from '../../../../entities/enums';
import { Company } from '../../../settings/entities/company.entity';

@Entity('stock_movements')
export class StockMovement extends BaseEntity {
  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column('uuid')
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'enum', enum: StockMovementType })
  type: StockMovementType;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  quantity: number; // positive value; direction implied by `type`

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  unitCost: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  totalCost: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  balanceQuantityAfter: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  balanceAverageCostAfter: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  referenceType: string | null; // e.g. 'SALES_INVOICE'

  @Column('uuid', { nullable: true })
  referenceId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  referenceNumber: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('uuid')
  createdById: string;
}
