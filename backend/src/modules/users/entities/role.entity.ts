import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Permission } from './permission.entity';
import { User } from './user.entity';

@Entity('roles')
export class Role extends BaseEntity {
  @Column({ length: 100, unique: true })
  name: string;

  @Column({ length: 200, nullable: true })
  description: string;

  @Column({ default: false })
  isSystemRole: boolean;

  /** When set, any user given this role may only ever be granted access (via UserCompany) to this
   * one company — enforced in UsersService.create()/update(), which overrides whatever companyIds
   * the caller sent. Null (the default for every other role) means no such restriction. Lets a
   * role like "مدير فرع - المطبعة" be hard-locked to a single company without a whole separate
   * role-to-company subsystem. */
  @Column('uuid', { nullable: true })
  restrictedCompanyId: string | null;

  @ManyToMany(() => Permission, (permission) => permission.roles, { cascade: false })
  @JoinTable({
    name: 'role_permissions',
    joinColumn: { name: 'roleId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permissionId', referencedColumnName: 'id' },
  })
  permissions: Permission[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
