import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";

@Entity("branches")
export class Branch extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
  })
  code: string;

  @Column({
    type: "varchar",
    length: 200,
  })
  nameEn: string;

  @Column({
    type: "varchar",
    length: 200,
    nullable: true,
  })
  nameAr: string;

  @Column({
    type: "varchar",
    length: 300,
    nullable: true,
  })
  address: string;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  phone: string;

  @Column({
    type: "boolean",
    default: false,
  })
  isMainBranch: boolean;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;

  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, (company) => company.branches, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "companyId" })
  company: Company;
}
