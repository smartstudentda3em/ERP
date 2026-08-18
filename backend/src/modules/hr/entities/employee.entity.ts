import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";
import { Branch } from "../../settings/entities/branch.entity";
import { User } from "../../users/entities/user.entity";
import { SalesRepresentative } from "../../parties/entities/sales-representative.entity";

/**
 * "الموظفين" — applies to every company/branch, not just Printing Press. `branchId` is required
 * (not nullable like SalesRepresentative.branchId) since it's what payroll approval uses to
 * allocate the posted salary expense to the right branch — see PayrollService.approve().
 */
@Entity("employees")
export class Employee extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "branchId" })
  branch: Branch;

  @Column({
    type: "varchar",
    length: 200,
  })
  name: string;

  @Column({
    type: "varchar",
    length: 150,
  })
  jobTitle: string;

  @Column({
    type: "varchar",
    length: 30,
    nullable: true,
  })
  phone: string;

  @Column({
    type: "varchar",
    length: 150,
    nullable: true,
  })
  email: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  baseSalary: number;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;

  /** Links this employee row to their own login account, when one exists — set automatically by
   * UsersService.syncBranchManagerEmployee() whenever a "مدير فرع" user is saved with a branch, the
   * same way SalesRepresentative.userId is auto-linked. Lets a logged-in branch manager's own
   * payroll data be resolved server-side from their JWT instead of a client-supplied id. */
  @Column("uuid", { nullable: true })
  userId: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user: User | null;

  /** Links this employee row to the "المناديب" record it was auto-provisioned from (or backfilled
   * against) — see SalesRepresentativesService.syncEmployeeForRep(). Independent of `userId`: most
   * reps added directly on the Representatives screen never get a login account, so `userId` alone
   * can't carry this link. `onDelete: SET NULL` rather than CASCADE — deleting a rep must never wipe
   * out this employee's own payroll/leave history, just detach the link (syncEmployeeForRep also
   * deactivates the row explicitly before the rep is removed, for the same reason). */
  @Column("uuid", { nullable: true })
  salesRepresentativeId: string;

  @ManyToOne(() => SalesRepresentative, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "salesRepresentativeId" })
  salesRepresentative: SalesRepresentative | null;
}
