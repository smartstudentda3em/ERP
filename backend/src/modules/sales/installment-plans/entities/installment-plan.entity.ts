import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Customer } from "../../../parties/customers/entities/customer.entity";
import { Product } from "../../../inventory/products/entities/product.entity";
import { Company } from "../../../settings/entities/company.entity";
import { Branch } from "../../../settings/entities/branch.entity";
import { Warehouse } from "../../../settings/entities/warehouse.entity";
import {
  InstallmentInterestType,
  InstallmentPlanStatus,
} from "../../../../entities/enums";

/**
 * An installment sale contract ("عقد تقسيط") — a standalone document from SalesInvoice (confirmed
 * design decision: not a payment-mode flag on a regular invoice). Contract-terms columns
 * (financedPrincipal/totalInterestAmount/totalPayable/installmentAmount) are computed ONCE at
 * creation and stored, since they describe the signed contract itself and never change — unlike a
 * running balance, which is always derived live from InstallmentPayment rows (see
 * InstallmentScheduleItem for why no amountPaid/status column exists there).
 */
@Entity("installment_plans")
export class InstallmentPlan extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid", { nullable: true })
  branchId: string | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "branchId" })
  branch: Branch | null;

  @Column("uuid")
  customerId: string;

  @ManyToOne(() => Customer, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "customerId" })
  customer: Customer;

  @Column("uuid")
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouseId" })
  warehouse: Warehouse;

  @Column({ type: "date" })
  purchaseDate: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  downPayment: number;

  @Column({ type: "enum", enum: InstallmentInterestType })
  interestType: InstallmentInterestType;

  @Column({ type: "numeric", precision: 9, scale: 4 })
  interestRate: number;

  @Column("int")
  tenureMonths: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  financedPrincipal: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  totalInterestAmount: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  totalPayable: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  installmentAmount: number;

  @Column({
    type: "enum",
    enum: InstallmentPlanStatus,
    default: InstallmentPlanStatus.ACTIVE,
  })
  status: InstallmentPlanStatus;

  @Column({ type: "timestamptz", nullable: true })
  settledAt: Date | null;

  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  settlementDiscountAmount: number | null;

  @Column({ type: "text", nullable: true })
  settlementNotes: string | null;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => InstallmentPlanLine, (line) => line.installmentPlan, {
    cascade: true,
  })
  lines: InstallmentPlanLine[];
}

@Entity("installment_plan_lines")
export class InstallmentPlanLine extends BaseEntity {
  @Column("uuid")
  installmentPlanId: string;

  @ManyToOne(() => InstallmentPlan, (plan) => plan.lines, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "installmentPlanId" })
  installmentPlan: InstallmentPlan;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  quantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitPrice: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  lineTotal: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitCost: number;
}
