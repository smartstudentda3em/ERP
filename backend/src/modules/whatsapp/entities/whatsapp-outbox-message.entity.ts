import { Column, Entity } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { WhatsAppMessageType } from "../../../entities/enums";

/**
 * A logged WhatsApp-style message. No real WhatsApp Business API credentials exist yet (confirmed
 * with the user) — every message currently produced by DashboardWhatsAppProvider lands here with
 * status SENT immediately, and is surfaced on the Dashboard as a clearly-labeled placeholder feed.
 * Swapping in a real provider later means implementing WhatsAppNotifier and writing this same row
 * for audit purposes — no other code changes.
 */
@Entity("whatsapp_outbox_messages")
export class WhatsAppOutboxMessage extends BaseEntity {
  @Column({ type: "enum", enum: WhatsAppMessageType })
  messageType: WhatsAppMessageType;

  @Column({
    type: "varchar",
    length: 200,
  })
  recipientLabel: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  recipientPhone: string;

  @Column({ type: "text" })
  content: string;

  @Column("uuid", { nullable: true })
  relatedInstallmentPlanId: string;

  /** Used only for the daily reminder cron's idempotency check (skip if a CUSTOMER_REMINDER
   * already exists today for this schedule item) — not a relation, just a dedup key. */
  @Column("uuid", { nullable: true })
  relatedScheduleItemId: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "SENT",
  })
  status: string;

  @Column("uuid")
  companyId: string;
}
