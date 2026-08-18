import { Column, Entity, Unique } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { NumberingResetPeriod } from "../../../entities/enums";

/**
 * One series per company+documentType — without this, two rows for the same
 * (companyId, documentType) can coexist (e.g. created via a race in the Settings UI), and
 * reserveNumber()'s unordered `.getOne()` would then alternate between their independently
 * drifting counters, eventually reserving the same formatted number twice and blowing up
 * cash_movements' documentNumber unique constraint on save.
 */
@Entity("numbering_series")
@Unique(["companyId", "documentType"])
export class NumberingSeries extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @Column({
    type: "varchar",
    length: 50,
  })
  documentType: string; // e.g. SALES_INVOICE, JOURNAL_VOUCHER, PURCHASE_ORDER

  @Column({
    type: "varchar",
    length: 20,
    default: "",
  })
  prefix: string;

  /** The number the series starts (or resets back to) — distinct from `nextNumber`, which is the live counter. */
  @Column({ type: "int", default: 1 })
  startNumber: number;

  @Column({ type: "int", default: 1 })
  nextNumber: number;

  @Column({ type: "int", default: 6 })
  padLength: number;

  @Column({
    type: "varchar",
    length: 20,
    default: "",
  })
  suffix: string;

  @Column({
    type: "enum",
    enum: NumberingResetPeriod,
    default: NumberingResetPeriod.NEVER,
  })
  resetPeriod: NumberingResetPeriod;

  /** Period key ('2026' for yearly, '2026-07' for monthly) the counter was last reset for — lets getNextNumber() detect a rollover. */
  @Column({ type: "varchar", length: 10, nullable: true })
  lastResetKey: string;
}
