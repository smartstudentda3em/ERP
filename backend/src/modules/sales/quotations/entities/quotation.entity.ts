import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Customer } from '../../../parties/customers/entities/customer.entity';
import { Product } from '../../../inventory/products/entities/product.entity';
import { Company } from '../../../settings/entities/company.entity';
import { Branch } from '../../../settings/entities/branch.entity';
import { SalesRepresentative } from '../../../parties/entities/sales-representative.entity';
import { SalesDocumentStatus } from '../../../../entities/enums';

@Entity('quotations')
export class Quotation extends BaseEntity {
  @Column({ length: 50, unique: true })
  documentNumber: string;

  @Column({ type: 'date' })
  quotationDate: string;

  @Column({ type: 'date', nullable: true })
  validUntil: string | null;

  @Column('uuid')
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

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

  @Column('uuid', { nullable: true })
  salesRepresentativeId: string | null;

  @ManyToOne(() => SalesRepresentative, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'salesRepresentativeId' })
  salesRepresentative: SalesRepresentative | null;

  @Column({ type: 'enum', enum: SalesDocumentStatus, default: SalesDocumentStatus.DRAFT })
  status: SalesDocumentStatus;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  subtotal: number;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  grandTotal: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('uuid')
  createdById: string;

  @OneToMany(() => QuotationLine, (line) => line.quotation, { cascade: true })
  lines: QuotationLine[];
}

@Entity('quotation_lines')
export class QuotationLine extends BaseEntity {
  @Column('uuid')
  quotationId: string;

  @ManyToOne(() => Quotation, (q) => q.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quotationId' })
  quotation: Quotation;

  @Column('uuid')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  quantity: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  unitPrice: number;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  lineTotal: number;
}
