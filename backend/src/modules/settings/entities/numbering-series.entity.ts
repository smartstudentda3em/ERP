import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { NumberingResetPeriod } from "../../../entities/enums";

@Entity("numbering_series")
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
  lastResetKey: string | null;
}
