import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";

@Entity("taxes")
export class Tax extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 50,
  })
  code: string;

  @Column({
    type: "varchar",
    length: 150,
  })
  nameEn: string;

  @Column({
    type: "varchar",
    length: 150,
    nullable: true,
  })
  nameAr: string;

  @Column({ type: "numeric", precision: 7, scale: 4 })
  rate: number; // percentage, e.g. 14.0000

  @Column({
    type: "boolean",
    default: false,
  })
  isWithholding: boolean;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}
