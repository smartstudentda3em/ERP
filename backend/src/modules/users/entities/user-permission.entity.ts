import { Column, Entity, JoinColumn, ManyToOne, Unique } from "typeorm";
import { BaseEntity } from "../../../entities/base.entity";
import { User } from "./user.entity";
import { Permission } from "./permission.entity";

/**
 * A per-user adjustment on top of the permissions his roles already give him:
 *  - GRANT: an operation he gets even though none of his roles has it;
 *  - DENY : an operation one of his roles has but he must not be allowed to do.
 * No row = he simply gets whatever his roles give him. Effective permissions are therefore
 * (role permissions ∪ GRANTs) − DENYs — see PermissionsResolver. Only the founder can write these.
 */
@Entity("user_permissions")
@Unique(["userId", "permissionId"])
export class UserPermission extends BaseEntity {
  @Column("uuid")
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column("uuid")
  permissionId: string;

  @ManyToOne(() => Permission, { onDelete: "CASCADE" })
  @JoinColumn({ name: "permissionId" })
  permission: Permission;

  @Column({ type: "varchar", length: 10 })
  effect: "GRANT" | "DENY";

  @Column("uuid", { nullable: true })
  updatedById: string | null;
}
