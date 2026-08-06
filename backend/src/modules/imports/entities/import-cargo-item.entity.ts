import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { ImportCargoStatus } from '../../../entities/enums';
import { Company } from '../../settings/entities/company.entity';
import { Supplier } from '../../parties/suppliers/entities/supplier.entity';
import { Product } from '../../inventory/products/entities/product.entity';
import { Currency } from '../../settings/entities/currency.entity';
import { Shipment } from './shipment.entity';

/**
 * One line of goods being imported — tracked from the moment it's ordered from a supplier,
 * through readiness for shipping, up to being assigned to an actual Shipment.
 */
@Entity('import_cargo_items')
export class ImportCargoItem extends BaseEntity {
  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column('uuid')
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  /** Base-unit quantity ordered — never packages/cartons, matching the product's own unit. */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  quantity: number;

  /** Unit purchase price agreed with the supplier, in the supplier's own currency (see currencyId). */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  unitPrice: number;

  /** Snapshot of the selected supplier's currency at the time this line was recorded — set
   * server-side from Supplier.currencyId, never trusted from the client. */
  @Column('uuid', { nullable: true })
  currencyId: string | null;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currencyId' })
  currency: Currency | null;

  /** Manually-entered multiplier for converting unitPrice (in the supplier's currency) into the
   * local/base currency — defaults to 1 (no conversion) whenever left blank, so the local-price
   * columns can always compute a real number instead of falling back to "—". */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 1 })
  conversionRate: number;

  /** Which currency "السعر بالعملة المحلية"/"الإجمالي بالعملة المحلية" are expressed in — a
   * user choice (like conversionRate), not a fact derived elsewhere, so it's trusted from the
   * client rather than server-derived the way currencyId is. */
  @Column('uuid', { nullable: true })
  localCurrencyId: string | null;

  @ManyToOne(() => Currency, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'localCurrencyId' })
  localCurrency: Currency | null;

  @Column({ type: 'text', nullable: true })
  specifications: string | null;

  @Column({ type: 'date' })
  orderDate: string;

  @Column({ type: 'enum', enum: ImportCargoStatus, default: ImportCargoStatus.ORDERED })
  status: ImportCargoStatus;

  @Column('uuid')
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'shipmentId' })
  shipment: Shipment;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column('uuid')
  createdById: string;
}
