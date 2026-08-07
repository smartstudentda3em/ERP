import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";

@Entity("fiscal_years")
export class FiscalYear extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 50,
  })
  name: string; // e.g. FY2026

  @Column({ type: "date" })
  startDate: string;

  @Column({ type: "date" })
  endDate: string;

  @Column({
    type: "boolean",
    default: false,
  })
  isClosed: boolean;
}
