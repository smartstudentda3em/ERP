import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "../../settings/entities/company.entity";
import { ShipmentExpense } from "./shipment-expense.entity";

/** One shipment/container moving imported cargo from a supplier to the company's warehouse. */
@Entity("shipments")
export class Shipment extends BaseEntity {
  @Column({
    type: "varchar",
    length: 200,
  })
  shipmentName: string;

  @Column({ type: "date", nullable: true })
  shipmentDate: string;

  @Column({
    type: "varchar",
    length: 200,
  })
  shippingCompanyName: string;

  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  createdById: string;

  @OneToMany(() => ShipmentExpense, (e) => e.shipment, { cascade: true })
  expenses: ShipmentExpense[];
}
