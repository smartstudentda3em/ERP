import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";

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

  @Column({ type: "varchar", length: 64, nullable: true })
  entityId: string | null;

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
