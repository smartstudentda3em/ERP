import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Shipment } from "./shipment.entity";
import {
  CashMovementAccount,
  ShipmentPaymentType,
} from "../../../entities/enums";

/** One payment made against a shipment's cost — a purely statistical record for the Import
 * module's own cost tracking (amount/shipment/date/type), never mirrored by a CashMovement and
 * never affecting the treasury balance (see ShipmentPaymentsService). `account` is retained only
 * to preserve historical rows created before this was memo-only; new payments no longer collect
 * it at all. */
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

  @Column({ type: "enum", enum: CashMovementAccount, nullable: true })
  account: CashMovementAccount | null;

  @Column({ type: "text", nullable: true })
  notes: string | null;

  @Column("uuid")
  createdById: string;
}
