import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";

// Per-company, not global — two companies may each define their own USD/EGP row.
@Entity("currencies")
@Unique(["companyId", "code"])
export class Currency extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 10,
  })
  code: string; // ISO 4217, e.g. USD, EUR, EGP

  @Column({
    type: "varchar",
    length: 100,
  })
  nameEn: string;

  @Column({
    type: "varchar",
    length: 100,
    nullable: true,
  })
  nameAr: string;

  @Column({
    type: "varchar",
    length: 10,
    nullable: true,
  })
  symbol: string;

  @Column({ type: "int", default: 2 })
  decimalPlaces: number;

  @Column({
    type: "boolean",
    default: false,
  })
  isBaseCurrency: boolean;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}
