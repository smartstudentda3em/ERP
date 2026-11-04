import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";

/**
 * Printing Press month-end closing ("تقفيلة الشهر"): while a row is isClosed, nothing dated inside
 * that calendar month can be added, edited or deleted — enforced at the database level by the
 * triggers MonthClosingsBootstrap installs, so no code path can bypass it. Re-opening keeps the row
 * (isClosed=false) so who closed/reopened it and when stays on record.
 */
@Entity("month_closings")
@Unique(["companyId", "year", "month"])
export class MonthClosing extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({ type: "int" })
  year: number;

  /** 1–12 */
  @Column({ type: "int" })
  month: number;

  @Column({ type: "boolean", default: true })
  isClosed: boolean;

  @Column({ type: "uuid", nullable: true })
  closedById: string | null;

  @Column({ type: "timestamptz", nullable: true })
  closedAt: Date | null;

  @Column({ type: "uuid", nullable: true })
  reopenedById: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reopenedAt: Date | null;
}
