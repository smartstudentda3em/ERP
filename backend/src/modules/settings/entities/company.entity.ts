import { Column, Entity, OneToMany } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Branch } from "./branch.entity";

@Entity("companies")
export class Company extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
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
    length: 100,
    nullable: true,
  })
  taxNumber: string;

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
  logoUrl: string;

  @Column({
    type: "varchar",
    length: 10,
    default: "USD",
  })
  baseCurrencyCode: string;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;

  @Column({
    type: "boolean",
    default: true,
  })
  warnOnSellBelowCost: boolean;

  @OneToMany(() => Branch, (branch) => branch.company)
  branches: Branch[];
}
