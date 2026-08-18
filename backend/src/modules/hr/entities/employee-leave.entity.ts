import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";
import { Employee } from "./employee.entity";
import { LeaveType } from "../../../entities/enums";

/**
 * A single logged leave/vacation period for one employee — "الإجازات والعطلات" in the employee
 * detail panel. Deliberately no approval workflow: an admin records a leave that already
 * happened (or was approved outside the system), purely so the monthly/yearly history view has
 * real data instead of an empty state.
 */
@Entity("employee_leaves")
export class EmployeeLeave extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  employeeId: string;

  @ManyToOne(() => Employee, { onDelete: "CASCADE" })
  @JoinColumn({ name: "employeeId" })
  employee: Employee;

  @Column({ type: "date" })
  startDate: string;

  @Column({ type: "date" })
  endDate: string;

  @Column({ type: "enum", enum: LeaveType, default: LeaveType.ANNUAL })
  type: LeaveType;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column("uuid")
  createdById: string;
}
