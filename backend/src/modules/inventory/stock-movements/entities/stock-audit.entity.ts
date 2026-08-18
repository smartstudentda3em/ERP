import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Warehouse } from "../../../settings/entities/warehouse.entity";
import { Product } from "../../products/entities/product.entity";
import { DocumentStatus } from "../../../../entities/enums";
import { Company } from "../../../settings/entities/company.entity";

/**
 * A physical stock count for one warehouse — "الجرد الشهري" (monthly) for Printing Press,
 * "الجرد السنوي" (annual) for Stationery/Air Conditioning; both share this same entity and
 * `auditDate` column, just scoped to a different calendar period by the frontend/service (see
 * StockAuditsService.getSetupLines()'s monthRange()/yearRange() split). Submitting (CONFIRMED)
 * never touches real stock levels; only a subsequent administrative approval (APPROVED)
 * reconciles them, by delegating to the existing StockAdjustmentsService — see
 * StockAuditsService.approve().
 */
@Entity("stock_audits")
@Unique(["companyId", "documentNumber"])
export class StockAudit extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 50,
  })
  documentNumber: string;

  @Column({ type: "date" })
  auditDate: string;

  @Column("uuid")
  warehouseId: string;

  @ManyToOne(() => Warehouse, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "warehouseId" })
  warehouse: Warehouse;

  @Column({ type: "text", nullable: true })
  notes: string;

  /** CONFIRMED = submitted by the Press user and locked (no stock movement yet). APPROVED =
   * an admin reviewed it and the counted variances were applied to stock. */
  @Column({
    type: "enum",
    enum: DocumentStatus,
    default: DocumentStatus.CONFIRMED,
  })
  status: DocumentStatus;

  @Column("uuid")
  createdById: string;

  @Column("uuid", { nullable: true })
  approvedById: string;

  @Column({ type: "timestamptz", nullable: true })
  approvedAt: Date;

  /** The StockAdjustment created at approval time, for traceability back to the actual stock
   * movements this audit produced. Null until approved. */
  @Column("uuid", { nullable: true })
  stockAdjustmentId: string;

  @OneToMany(() => StockAuditLine, (line) => line.audit, { cascade: true })
  lines: StockAuditLine[];
}

@Entity("stock_audit_lines")
export class StockAuditLine extends BaseEntity {
  @Column("uuid")
  auditId: string;

  @ManyToOne(() => StockAudit, (audit) => audit.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "auditId" })
  audit: StockAudit;

  @Column("uuid")
  productId: string;

  @ManyToOne(() => Product, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "productId" })
  product: Product;

  /** Snapshot of stockLevels.quantityOnHand at the moment the audit was submitted. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  systemQuantity: number;

  /** Null means this material was left uncounted ("بانتظار الجرد") — never reconciled at approval. */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  actualQuantity: number;

  /** The final quantity actually written to stock at approval time — defaults to actualQuantity
   * unless the approving admin overrides it while reviewing the pending audit (see
   * StockAuditsService.approve()). Null until approved. */
  @Column({ type: "numeric", precision: 18, scale: 4, nullable: true })
  adjustedQuantity: number;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  unitCost: number;
}
