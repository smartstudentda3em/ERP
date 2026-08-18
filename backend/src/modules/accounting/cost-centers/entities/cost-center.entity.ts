import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";

@Entity("cost_centers")
export class CostCenter extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
  })
  code: string;

  @Column({
    type: "varchar",
    length: 200,
  })
  name: string;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}

@Entity("projects")
export class Project extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
  })
  code: string;

  @Column({
    type: "varchar",
    length: 200,
  })
  name: string;

  @Column({ type: "date", nullable: true })
  startDate: string | null;

  @Column({ type: "date", nullable: true })
  endDate: string | null;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  budgetAmount: number;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}

@Entity("budgets")
export class Budget extends BaseEntity {
  @Column("uuid")
  accountId: string;

  @Column("uuid", { nullable: true })
  costCenterId: string | null;

  @Column({
    type: "varchar",
    length: 20,
  })
  fiscalYearCode: string;

  @Column({ type: "int" })
  month: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  budgetedAmount: number;
}
