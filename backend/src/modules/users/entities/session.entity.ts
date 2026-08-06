import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';
import { User } from './user.entity';

@Entity('sessions')
export class Session extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ length: 500 })
  refreshTokenHash: string;

  @Column({ length: 64, nullable: true })
  ipAddress: string;

  @Column({ length: 300, nullable: true })
  userAgent: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;
}
