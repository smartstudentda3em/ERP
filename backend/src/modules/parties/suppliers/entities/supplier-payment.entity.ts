import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Supplier } from './supplier.entity';
import { PaymentMethod } from '../../../../entities/enums';

@Entity('supplier_payments')
export class SupplierPayment extends BaseEntity {
  @Column({ length: 50, unique: true })
  documentNumber: string;

  @Column({ type: 'date' })
  paymentDate: string;

  @Column('uuid')
  supplierId: string;

  @ManyToOne(() => Supplier, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @Column('uuid')
  companyId: string;

  @Column('uuid', { nullable: true })
  branchId: string | null;

  /** Optional link to the specific receipt this payment settles — omitted for a general payment on account. */
  @Column('uuid', { nullable: true })
  purchaseReceiptId: string | null;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'numeric', precision: 18, scale: 4 })
  amount: number;

  @Column({ length: 100, nullable: true })
  referenceNumber: string | null;

  @Column('uuid', { nullable: true })
  cashMovementId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('uuid')
  createdById: string;
}
