import { Column, Entity, JoinTable, ManyToMany, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { Role } from './role.entity';
import { Company } from '../../settings/entities/company.entity';
import { Branch } from '../../settings/entities/branch.entity';

@Entity('users')
export class User extends BaseEntity {
  // Optional secondary contact field now that phone is the required login identifier — unique
  // only applies to non-null values (Postgres never treats two NULLs as a duplicate).
  @Column({ type: 'varchar', length: 150, unique: true, nullable: true })
  email: string | null;

  @Column({ length: 150 })
  fullName: string;

  @Column({ select: false })
  passwordHash: string;

  // The primary login identifier — see AuthService.login().
  @Column({ length: 30, unique: true })
  phone: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  @Column('uuid', { nullable: true })
  companyId: string | null;

  @ManyToOne(() => Company, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'companyId' })
  company: Company | null;

  @Column('uuid', { nullable: true })
  branchId: string | null;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branchId' })
  branch: Branch | null;

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' },
  })
  roles: Role[];
}
