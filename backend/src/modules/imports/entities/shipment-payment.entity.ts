import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Shipment } from "./shipment.entity";
import {
  CashMovementAccount,
  ShipmentPaymentType,
} from "../../../entities/enums";

/** One payment made against a shipment's cost — always mirrored by a CashMovement (see
 * ShipmentPaymentsService), so the treasury balance and this history always agree. */
@Entity("shipment_payments")
export class ShipmentPayment extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @Column({
    type: "varchar",
    length: 40,
  })
  documentNumber: string;

  @Column({ type: "date" })
  paymentDate: string;

  @Column("uuid")
  shipmentId: string;

  @ManyToOne(() => Shipment, { onDelete: "CASCADE" })
  @JoinColumn({ name: "shipmentId" })
  shipment: Shipment;

  @Column({ type: "enum", enum: ShipmentPaymentType })
  paymentType: ShipmentPaymentType;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({ type: "enum", enum: CashMovementAccount })
  account: CashMovementAccount;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column("uuid")
  createdById: string;
}
