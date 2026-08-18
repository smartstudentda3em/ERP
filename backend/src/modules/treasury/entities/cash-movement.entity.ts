import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
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
 *
 * documentNumber is unique per company, not globally — matches the same @Unique(["companyId",
 * "documentNumber"]) pattern already used by PurchaseReceipt/StockAdjustment/StockAudit/
 * StockTransfer. A bare column-level `unique: true` here (as this entity had before) is a global
 * constraint across every company sharing this one table; since NumberingSeriesService reserves
 * numbers independently per company, two companies' counters can legitimately reach the same
 * number at the same time, and if their configured prefixes ever happen to collide (e.g. both left
 * at the seed's generic "CM-" instead of being customized per company in Settings), that global
 * constraint throws a raw "duplicate key" for one of them with no way to self-heal — the retry loop
 * in CashMovementsService.record() only escapes a same-company collision, not this cross-company
 * one, since the colliding company's own counter is nowhere near catching up to the other one's.
 */
@Entity("cash_movements")
@Unique(["companyId", "documentNumber"])
export class CashMovement extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
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

  /** How much of this row's own amount has already been swept into a rep-treasury settlement
   * transfer (see CashMovementsService.settleRepTreasuryFifo) — only meaningful on
   * account=REP_TREASURY, type=INCOME rows; always 0 elsewhere. `amount - settledAmount` is what
   * still counts toward the rep's outstanding breakdown. */
  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  settledAmount: number;

  @Column({ type: "enum", enum: CashMovementSourceType })
  sourceType: CashMovementSourceType;

  @Column("uuid", { nullable: true })
  sourceId: string;

  /** Free-text classification for manual entries — rent, salaries, electricity, etc. */
  @Column({ type: "varchar", length: 100, nullable: true })
  category: string;

  @Column("uuid", { nullable: true })
  partyCustomerId: string;

  @ManyToOne(() => Customer, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "partyCustomerId" })
  partyCustomer: Customer | null;

  @Column("uuid", { nullable: true })
  partySupplierId: string;

  @ManyToOne(() => Supplier, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "partySupplierId" })
  partySupplier: Supplier | null;

  /** Which partner this movement is attributed to — set on capital-injection movements, split per partner by their sharePercentage at the moment of injection. */
  @Column("uuid", { nullable: true })
  partnerId: string;

  @ManyToOne(() => Partner, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "partnerId" })
  partner: Partner | null;

  /** Which branch manager this movement is attributed to — set on commission-payout movements
   * ("صرف الأرباح"), the same role partnerId plays for capital injections/dividends. */
  @Column("uuid", { nullable: true })
  salesRepresentativeId: string;

  @ManyToOne(() => SalesRepresentative, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "salesRepresentativeId" })
  salesRepresentative: SalesRepresentative | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  description: string;

  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid", { nullable: true })
  branchId: string;

  @ManyToOne(() => Branch, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "branchId" })
  branch: Branch | null;

  @Column("uuid")
  createdById: string;
}
