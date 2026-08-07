import { Column, Entity, JoinColumn, ManyToOne } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { User } from "./user.entity";
import { Company } from "../../settings/entities/company.entity";

/**
 * ACL row: which companies a non-admin user may access. The true Administrator (Role.isSystemRole)
 * bypasses this entirely and has implicit access to every company — see
 * AuthService.extractCompanyIds() — so an Administrator account never needs rows here.
 */
@Entity("user_companies")
export class UserCompany extends BaseEntity {
  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("uuid")
  companyId: string;

  @ManyToOne(() => Company, { onDelete: "CASCADE" })
  @JoinColumn({ name: "companyId" })
  company: Company;
}
