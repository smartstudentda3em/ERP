import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";
import { Branch } from "./branch.entity";

@Entity("warehouses")
export class Warehouse extends BaseEntity {
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
    type: "boolean",
    default: false,
  })
  isDefault: boolean;

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
  branchId: string;

  @ManyToOne(() => Branch, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "branchId" })
  branch: Branch | null;
}
