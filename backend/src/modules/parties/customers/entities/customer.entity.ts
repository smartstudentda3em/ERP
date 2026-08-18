import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../../entities/base.entity";
import { Company } from "../../../settings/entities/company.entity";
import { SalesRepresentative } from "../../entities/sales-representative.entity";
import { CustomerCreditStatus } from "../../../../entities/enums";

@Entity("customers")
export class Customer extends BaseEntity {
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
    type: "varchar",
    length: 30,
    nullable: true,
  })
  mobile: string;

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

  @Column({
    type: "varchar",
    length: 300,
    nullable: true,
  })
  address: string;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
  })
  taxNumber: string;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  creditLimit: number;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  openingBalance: number;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;

  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid", { nullable: true })
  salesRepresentativeId: string;

  @ManyToOne(() => SalesRepresentative, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "salesRepresentativeId" })
  salesRepresentative: SalesRepresentative | null;

  @Column("uuid", { nullable: true })
  glAccountId: string;

  /** Eligibility to be sold to on installment — checked only by InstallmentPlansService.create(),
   * never by regular sales-invoice creation. */
  @Column({
    type: "enum",
    enum: CustomerCreditStatus,
    default: CustomerCreditStatus.RELIABLE,
  })
  creditStatus: CustomerCreditStatus;

  @Column({ type: "text", nullable: true })
  blockedReason: string;
}
