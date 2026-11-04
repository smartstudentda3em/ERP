import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";

export type AuditActionType =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "LOGIN"
  | "LOGOUT"
  | "PRINT"
  | "APPROVE"
  | "OTHER";

/**
 * Append-only activity trail. Two kinds of row share this table (`source`):
 *  - CHANGE: one row per business record that was created/updated/deleted, with its old/new values
 *    (captured at the ORM level by AuditSubscriber, after the transaction actually committed);
 *  - REQUEST: one row per API request that produced no such change (login, print, a refused/failed
 *    attempt, an action that bypassed the ORM) — see AuditLogInterceptor.
 * Rows can never be updated or deleted: database triggers (AuditLogBootstrap) reject it for everyone.
 */
@Entity("audit_logs")
export class AuditLog extends BaseEntity {
  // Nullable — some requests (login, requests with no authenticated user, requests before a
  // company is even selected) have no company context to stamp.
  @Column("uuid", { nullable: true })
  companyId: string | null;

  @Column("uuid", { nullable: true })
  userId: string | null;

  @Column({ type: "varchar", length: 150, nullable: true })
  userEmail: string | null;

  /** Snapshot of the user's full name / role names at the time — survives later renames/deletions. */
  @Column({ type: "varchar", length: 150, nullable: true })
  userName: string | null;

  @Column({ type: "varchar", length: 200, nullable: true })
  userRole: string | null;

  /** The company/branch ("المطبعة"، "التكييفات"…) the event belongs to. */
  @Column({ type: "varchar", length: 150, nullable: true })
  departmentName: string | null;

  @Column({
    type: "varchar",
    length: 10,
  })
  method: string;

  @Column({
    type: "varchar",
    length: 300,
  })
  path: string;

  @Column({ type: "varchar", length: 100, nullable: true })
  module: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  action: string | null;

  @Column({ type: "varchar", length: 20, default: "OTHER" })
  actionType: AuditActionType;

  @Column({ type: "varchar", length: 20, default: "REQUEST" })
  source: "CHANGE" | "REQUEST";

  /** Target table name (e.g. sales_invoices) and its Arabic label (فاتورة بيع). */
  @Column({ type: "varchar", length: 100, nullable: true })
  targetModel: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  targetLabel: string | null;

  /** The id of the affected record. */
  @Column({ type: "varchar", length: 64, nullable: true })
  entityId: string | null;

  @Column({ type: "jsonb", nullable: true })
  oldValues: Record<string, unknown> | null;

  @Column({ type: "jsonb", nullable: true })
  newValues: Record<string, unknown> | null;

  /** Short Arabic description of what happened. */
  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column({ type: "jsonb", nullable: true })
  requestBody: Record<string, unknown> | null;

  @Column({ type: "int" })
  statusCode: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ type: "varchar", length: 300, nullable: true })
  userAgent: string | null;

  @Column({ type: "int", nullable: true })
  durationMs: number | null;
}
