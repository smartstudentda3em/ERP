import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Customer } from '../../../parties/customers/entities/customer.entity';
import { Product } from '../../../inventory/products/entities/product.entity';
import { Company } from '../../../settings/entities/company.entity';
import { Branch } from '../../../settings/entities/branch.entity';
import { Warehouse } from '../../../settings/entities/warehouse.entity';
import { SalesDocumentStatus } from '../../../../entities/enums';
import { Quotation } from '../../quotations/entities/quotation.entity';

@Entity('sales_orders')
export class SalesOrder extends BaseEntity {
  @Column({ length: 50, unique: true })
  documentNumber: string;

  @Column({ type: 'date' })
  orderDate: string;

  @Column('uuid')
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @Column('uuid', { nullable: true })
  quotationId: string | null;

  @ManyToOne(() => Quotation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'quotationId' })
  quotation: Quotation | null;

  @Column('uuid')
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column('uuid')
  companyId: string;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId' })
  company: Company;

  @Column('uuid', { nullable: true })
  branchId: string | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch | null;

  @Column({ type: 'enum', enum: SalesDocumentStatus, default: SalesDocumentStatus.DRAFT })
  status: SalesDocumentStatus;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  taxTotal: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  discountTotal: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  grandTotal: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('uuid')
  createdById: string;

  @OneToMany(() => SalesOrderLine, (line) => line.salesOrder, { cascade: true })
  lines: SalesOrderLine[];
}

@Entity('sales_order_lines')
export class SalesOrderLine extends BaseEntity {
  @Column('uuid')
  salesOrderId: string;

  @ManyToOne(() => SalesOrder, (o) => o.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder: SalesOrder;

  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  quantity: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  deliveredQuantity: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  unitPrice: number;

  @Column({ type: 'numeric', precision: 7, scale: 4, default: 0 })
  discountPercent: number;

  @Column({ type: 'numeric', precision: 7, scale: 4, default: 0 })
  taxPercent: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  lineTotal: number;
}

@Entity('delivery_notes')
export class DeliveryNote extends BaseEntity {
  @Column({ length: 50, unique: true })
  documentNumber: string;

  @Column({ type: 'date' })
  deliveryDate: string;

  @Column('uuid')
  salesOrderId: string;

  @ManyToOne(() => SalesOrder, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder: SalesOrder;

  @Column('uuid')
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'enum', enum: SalesDocumentStatus, default: SalesDocumentStatus.CONFIRMED })
  status: SalesDocumentStatus;

  @Column('uuid')
  createdById: string;
}
