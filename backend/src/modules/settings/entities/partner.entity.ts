import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { Company } from "./company.entity";

/**
 * An equity partner and their ownership share — managed under Settings > Partners, independently
 * per company (each of the businesses sharing this system has its own ownership/partners). The
 * combined sharePercentage across a single company's partners is enforced (by PartnersService) to
 * never exceed 100%.
 */
@Entity("partners")
export class Partner extends BaseEntity {
  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;

  @Column({
    type: "varchar",
    length: 150,
  })
  name: string;

  @Column({ type: "numeric", precision: 5, scale: 2 })
  sharePercentage: number;

  @Column({
    type: "boolean",
    default: true,
  })
  isActive: boolean;
}
