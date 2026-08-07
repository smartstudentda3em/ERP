import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";
import { ProductCategory } from "./product-category.entity";

@Entity("units")
export class Unit extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 20,
  })
  code: string; // e.g. PCS, KG, BOX

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

  // Every unit belongs to exactly one product category — drives the dependent unit dropdown on
  // the product create/edit forms, same pattern as Brand.categoryId.
  @Column("uuid")
  categoryId: string;

  @ManyToOne(() => ProductCategory, { onDelete: "CASCADE" })
  @JoinColumn({ name: "categoryId" })
  category: ProductCategory;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}
