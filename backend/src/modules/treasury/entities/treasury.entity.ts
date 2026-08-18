import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";

/** Treasury module is scaffolded (schema + stub API) in this pass — see docs/ROADMAP.md. */

@Entity("cash_boxes")
export class CashBox extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
  })
  code: string;

  @Column({
    type: "varchar",
    length: 150,
  })
  name: string;

  @Column({
    type: "varchar",
    length: 10,
    default: "USD",
  })
  currencyCode: string;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  currentBalance: number;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}

@Entity("bank_accounts")
export class BankAccount extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
  })
  code: string;

  @Column({
    type: "varchar",
    length: 150,
  })
  bankName: string;

  @Column({
    type: "varchar",
    length: 100,
  })
  accountNumber: string;

  @Column({
    type: "varchar",
    length: 50,
    nullable: true,
  })
  iban: string;

  @Column({
    type: "varchar",
    length: 10,
    default: "USD",
  })
  currencyCode: string;

  @Column({ type: "numeric", precision: 18, scale: 4, default: 0 })
  currentBalance: number;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}

@Entity("cash_transactions")
export class CashTransaction extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  transactionDate: string;

  @Column({ length: 10 })
  direction: "IN" | "OUT";

  @Column("uuid", { nullable: true })
  cashBoxId: string | null;

  @ManyToOne(() => CashBox, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "cashBoxId" })
  cashBox: CashBox | null;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column({
    type: "varchar",
    length: 300,
    nullable: true,
  })
  description: string;

  @Column("uuid", { nullable: true })
  journalEntryId: string | null;

  @Column("uuid")
  createdById: string;
}

@Entity("transfers")
export class Transfer extends BaseEntity {
  @Column({
    type: "varchar",
    length: 50,
    unique: true,
  })
  documentNumber: string;

  @Column({ type: "date" })
  transferDate: string;

  @Column({ length: 30 })
  fromAccountType: "CASH_BOX" | "BANK_ACCOUNT";

  @Column("uuid")
  fromAccountId: string;

  @Column({ length: 30 })
  toAccountType: "CASH_BOX" | "BANK_ACCOUNT";

  @Column("uuid")
  toAccountId: string;

  @Column({ type: "numeric", precision: 18, scale: 4 })
  amount: number;

  @Column("uuid", { nullable: true })
  journalEntryId: string | null;

  @Column("uuid")
  createdById: string;
}
