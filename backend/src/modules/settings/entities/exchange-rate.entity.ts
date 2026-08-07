import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Currency } from "./currency.entity";
import { Company } from "./company.entity";

@Entity("exchange_rates")
export class ExchangeRate extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column("uuid")
  currencyId: string;

  @ManyToOne(() => Currency, { onDelete: "CASCADE" })
  @JoinColumn({ name: "currencyId" })
  currency: Currency;

  @Column({ type: "numeric", precision: 18, scale: 6 })
  rateToBase: number;

  @Column({ type: "date" })
  effectiveDate: string;
}
