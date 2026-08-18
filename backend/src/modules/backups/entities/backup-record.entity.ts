import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

export enum BackupStatus {
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

export enum BackupTrigger {
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
}

/**
 * One row per backup attempt. Not company-scoped: this ERP's tenants share a single Postgres
 * database (separated by companyId columns), so a backup always covers every company at once.
 * `fileName` is the encrypted (.enc) file's name inside BACKUP_STORAGE_DIR, and doubles as its
 * S3 object key when uploadedToS3 is true.
 */
@Entity('backup_records')
export class BackupRecord extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  fileName: string;

  @Column({
    type: 'bigint',
    default: 0,
    transformer: { to: (value: number) => value, from: (value: string) => parseInt(value, 10) },
  })
  sizeBytes: number;

  @Column({ type: 'enum', enum: BackupStatus, default: BackupStatus.RUNNING })
  status: BackupStatus;

  @Column({ type: 'enum', enum: BackupTrigger })
  trigger: BackupTrigger;

  @Column({ type: 'boolean', default: false })
  uploadedToS3: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column('uuid', { nullable: true })
  triggeredById: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date;
}
