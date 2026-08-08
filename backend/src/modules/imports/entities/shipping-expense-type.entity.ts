import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";

/**
 * A reusable label for shipment cost line items (Customs, Freight, Handling, Tips, ...) —
 * managed centrally under Settings > Shipping Expense Types so the Shipping tab offers a
 * dropdown instead of letting every entry drift into slightly different spellings.
 */
@Entity("shipping_expense_types")
export class ShippingExpenseType extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

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
}
