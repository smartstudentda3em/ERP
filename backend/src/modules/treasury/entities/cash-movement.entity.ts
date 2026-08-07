import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import {
  CashMovementType,
  CashMovementAccount,
  CashMovementSourceType,
} from "../../../entities/enums";
import { Company } from "../../settings/entities/company.entity";
import { Branch } from "../../settings/entities/branch.entity";
import { Customer } from "../../parties/customers/entities/customer.entity";
import { Supplier } from "../../parties/suppliers/entities/supplier.entity";
import { Partner } from "../../settings/entities/partner.entity";
import { SalesRepresentative } from "../../parties/entities/sales-representative.entity";

/**
 * The single source of truth for every dinar that has actually moved through the business's cash
 * or bank account — replaces double-entry journal posting entirely. A credit sale or purchase
 * never creates a row here; only an actual payment does. Party balances (what a customer/supplier
 * owes) are computed separately, straight from sales_invoices/sales_payments and
 * purchase_receipts/supplier_payments — this table only tracks treasury movement.
 */
@Entity("cash_movements")
export class CashMovement extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  movementDate: string;

  @Column({ type: "enum", enum: CashMovementType })
  type: CashMovementType;

  @Column({ type: "enum", enum: CashMovementAccount })
  account: CashMovementAccount;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "enum", enum: CashMovementSourceType })
  sourceType: CashMovementSourceType;

  @Column("uuid", { nullable: true })
  sourceId: string | null;

  /** Free-text classification for manual entries — rent, salaries, electricity, etc. */
  @Column({ type: "varchar", length: 100, nullable: true })
  category: string | null;

  @Column("uuid", { nullable: true })
  partyCustomerId: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "partyCustomerId" })
  partyCustomer: Customer | null;

  @Column("uuid", { nullable: true })
  partySupplierId: string | null;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "partySupplierId" })
  partySupplier: Supplier | null;

  /** Which partner this movement is attributed to — set on capital-injection movements, split per partner by their sharePercentage at the moment of injection. */
  @Column("uuid", { nullable: true })
  partnerId: string | null;

  @ManyToOne(() => Partner, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "partnerId" })
  partner: Partner | null;

  /** Which branch manager this movement is attributed to — set on commission-payout movements
   * ("صرف الأرباح"), the same role partnerId plays for capital injections/dividends. */
  @Column("uuid", { nullable: true })
  salesRepresentativeId: string | null;

  @ManyToOne(() => SalesRepresentative, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "salesRepresentativeId" })
  salesRepresentative: SalesRepresentative | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  description: string | null;

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
  createdById: string;
}
