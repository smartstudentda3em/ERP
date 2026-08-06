import { Column, Entity, ManyToMany, Unique } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Role } from './role.entity';

export enum PermissionAction {
  VIEW = 'view',
  CREATE = 'create',
  EDIT = 'edit',
  DELETE = 'delete',
  PRINT = 'print',
  EXPORT = 'export',
  APPROVE = 'approve',
  CANCEL = 'cancel',
  SELL_BELOW_COST = 'sellBelowCost',
}

@Entity('permissions')
@Unique(['module', 'action'])
export class Permission extends BaseEntity {
  @Column({ length: 100 })
  module: string; // e.g. 'sales.invoice', 'accounting.journal-entry'

  @Column({ type: 'enum', enum: PermissionAction })
  action: PermissionAction;

  @Column({ length: 200, nullable: true })
  description: string;

  get code(): string {
    return `${this.module}.${this.action}`;
  }

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
