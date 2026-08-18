import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";
import { Branch } from "../../settings/entities/branch.entity";
import { Employee } from "./employee.entity";
import { CashMovementAccount, DocumentStatus } from "../../../entities/enums";

/**
 * One monthly payroll run per company (enforced by the unique index below — re-running the same
 * month would double-post salaries into operating expenses, exactly what "منع التكرار المالي"
 * rules out). Saving is CONFIRMED and never touches CashMovement; only approve() (PayrollService)
 * posts the net salaries, and only once, since CONFIRMED→APPROVED is a one-way transition.
 */
@Entity("payroll_runs")
@Unique(["companyId", "year", "month"])
export class PayrollRun extends BaseEntity {
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

  @Column("int")
  year: number;

  @Column("int")
  month: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  /** CONFIRMED = saved, lines locked, nothing posted yet. APPROVED = net salaries posted as one
   * CashMovement per branch (see PayrollService.approve()). */
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

  /** The Printing Press's chosen disbursement source (الكاش/البنك) — null for every other company,
   * which never posts payroll through a balance-checked account. Set once at create() time (Press
   * runs are created pre-approved, see PayrollService.create()) and reused by update()'s re-posting
   * after an edit, so a corrected run never silently redirects its debit to a different account. */
  @Column({ type: "enum", enum: CashMovementAccount, nullable: true })
  paymentAccount: CashMovementAccount | null;

  @OneToMany(() => PayrollRunLine, (line) => line.payrollRun, { cascade: true })
  lines: PayrollRunLine[];
}

@Entity("payroll_run_lines")
export class PayrollRunLine extends BaseEntity {
  @Column("uuid")
  payrollRunId: string;

  @ManyToOne(() => PayrollRun, (run) => run.lines, { onDelete: "CASCADE" })
  @JoinColumn({ name: "payrollRunId" })
  payrollRun: PayrollRun;

  @Column("uuid")
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "employeeId" })
  employee: Employee;

  /** Snapshot of Employee.branchId at run-creation time — the branch a later salary edit for the
   * employee shouldn't retroactively change on an already-saved payroll line. Also what
   * PayrollService.approve() groups by when posting the per-branch expense. */
  @Column("uuid")
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "branchId" })
  branch: Branch;

  /** Snapshot of Employee.baseSalary at run-creation time, same reasoning as branchId above. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  baseSalary: number;

  @Column({ type: "numeric", precision: 8, scale: 2, default: 0 })
  absenceDays: number;

  @Column({ type: "numeric", precision: 8, scale: 2, default: 0 })
  lateHours: number;

  /** الجزاءات أو السلف — penalties/advances deducted directly, not derived from a rate. */
  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  otherDeductions: number;

  /** = (baseSalary / 30) * absenceDays. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  absenceDeduction: number;

  /** = (baseSalary / 30 / 8) * lateHours — an 8-hour workday's worth of the daily rate. */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  lateDeduction: number;

  /** = max(0, baseSalary - absenceDeduction - lateDeduction - otherDeductions). */
  @Column({ type: "numeric", precision: 18, scale: 4 })
  netSalary: number;
}
