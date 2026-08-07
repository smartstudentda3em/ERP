import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";
import { ProductCategory } from "./product-category.entity";

@Entity("brands")
export class Brand extends BaseEntity {
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

  // Every brand belongs to exactly one product category — drives the dependent brand dropdown on
  // the product create/edit forms (pick a category, only that category's brands are selectable).
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
