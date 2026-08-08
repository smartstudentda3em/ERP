import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Shipment } from "./shipment.entity";
import { ShippingExpenseType } from "./shipping-expense-type.entity";

/** One cost line item posted against a shipment (freight, customs, handling, ...) — the shipment's total cost is always the live sum of these, never a separately-entered figure. */
@Entity("shipment_expenses")
export class ShipmentExpense extends BaseEntity {
  @Column("uuid")
  shipmentId: string;

  @ManyToOne(() => Shipment, (s) => s.expenses, { onDelete: "CASCADE" })
  @JoinColumn({ name: "shipmentId" })
  shipment: Shipment;

  @Column("uuid")
  shippingExpenseTypeId: string;

  @ManyToOne(() => ShippingExpenseType, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "shippingExpenseTypeId" })
  shippingExpenseType: ShippingExpenseType;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "text", nullable: true })
  description: string | null;

  @Column("uuid")
  createdById: string;
}
