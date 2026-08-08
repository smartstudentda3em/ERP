import { ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { BackupRecord, BackupStatus, BackupTrigger } from './entities/backup-record.entity';
import { BackupNotificationsService } from './backup-notifications.service';
import { User } from '../users/entities/user.entity';

const execFileAsync = promisify(execFile);
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
// Fixed confirmation code for the restore endpoint — same convention as
// SystemService.factoryReset()'s RESET_CODE (see the comment there). Deliberately not the
// caller's real account password; do not "fix" this without repeating that conversation.
const RESTORE_CODE = '0145';

export interface DecryptedBackupFile {
  filePath: string;
  fileName: string;
  cleanup: () => Promise<void>;
}

/**
 * Whole-database backups via pg_dump/pg_restore (custom format, `-F c`), encrypted at rest with
 * AES-256-GCM. Not company-scoped — this ERP's tenants share one Postgres database (separated by
 * companyId columns), so there's only ever one backup set, covering everyone at once.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);

  constructor(
    @InjectRepository(BackupRecord) private readonly repo: Repository<BackupRecord>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly config: ConfigService,
    private readonly notifications: BackupNotificationsService,
  ) {}

  async createBackup(trigger: BackupTrigger, triggeredById?: string): Promise<BackupRecord> {
    const record = this.repo.create({
      fileName: '',
      sizeBytes: 0,
      status: BackupStatus.RUNNING,
      trigger,
      triggeredById: triggeredById ?? null,
    });
    await this.repo.save(record);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dumpFileName = `backup-${timestamp}.dump`;
    const encFileName = `${dumpFileName}.enc`;
    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'erp-backup-'));
    const dumpPath = path.join(tmpDir, dumpFileName);

    try {
      await this.runPgDump(dumpPath);

      const storageDir = await this.ensureStorageDir();
      const encPath = path.join(storageDir, encFileName);
      await this.encryptFile(dumpPath, encPath);
      const { size } = await fsp.stat(encPath);

      let uploadedToS3 = false;
      const bucket = this.config.get<string>('backup.s3.bucket');
      if (bucket) {
        await this.uploadToS3(encPath, encFileName, bucket);
        uploadedToS3 = true;
      }

      record.fileName = encFileName;
      record.sizeBytes = size;
      record.status = BackupStatus.SUCCESS;
      record.uploadedToS3 = uploadedToS3;
      record.completedAt = new Date();
      await this.repo.save(record);

      await this.cleanupOldBackups();
      await this.notifications.notify({ success: true, fileName: encFileName, sizeBytes: size, trigger });
      return record;
    } catch (err) {
      const message = (err as Error).message;
      record.status = BackupStatus.FAILED;
      record.errorMessage = message;
      record.completedAt = new Date();
      await this.repo.save(record);
      await this.notifications.notify({ success: false, trigger, errorMessage: message });
      this.logger.error(`Backup failed: ${message}`);
      throw err;
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async listBackups(): Promise<BackupRecord[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  /** Decrypts to a fresh temp file for the download endpoint to stream — caller MUST call cleanup(). */
  async downloadBackup(id: string): Promise<DecryptedBackupFile> {
    const record = await this.findSuccessfulOrThrow(id);
    const storageDir = await this.ensureStorageDir();
    const encPath = path.join(storageDir, record.fileName);
    if (!fs.existsSync(encPath)) throw new NotFoundException('Backup file no longer exists on disk');

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'erp-backup-dl-'));
    const fileName = record.fileName.replace(/\.enc$/, '');
    const filePath = path.join(tmpDir, fileName);
    await this.decryptFile(encPath, filePath);

    return { filePath, fileName, cleanup: () => fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined) };
  }

  /**
   * Gated in three layers, mirroring SystemService.factoryReset(): (1) @Permissions('admin.backup.approve')
   * on the controller, (2) the caller's role re-checked directly against isSystemRole here — a
   * database restore overwrites every company's live data, so it must be the real
   * Administrator/Super-Admin role, not just anyone a permission was later granted to, (3) a
   * fixed confirmation code checked verbatim against the request body.
   */
  async restoreBackup(id: string, userId: string, confirmationCode: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId }, relations: ['roles'] });
    if (!user) throw new UnauthorizedException('User not found');

    const isSuperAdmin = user.roles?.some((role) => role.isSystemRole);
    if (!isSuperAdmin) {
      throw new ForbiddenException('Only the Administrator / Super Admin role can restore a backup');
    }
    if (confirmationCode !== RESTORE_CODE) {
      throw new UnauthorizedException('Incorrect confirmation code');
    }

    const record = await this.findSuccessfulOrThrow(id);
    const storageDir = await this.ensureStorageDir();
    const encPath = path.join(storageDir, record.fileName);
    if (!fs.existsSync(encPath)) throw new NotFoundException('Backup file no longer exists on disk');

    const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'erp-backup-restore-'));
    const decryptedPath = path.join(tmpDir, record.fileName.replace(/\.enc$/, ''));
    try {
      await this.decryptFile(encPath, decryptedPath);
      await this.runPgRestore(decryptedPath);
      this.logger.warn(`Database restored from backup ${record.id} (${record.fileName}) by user ${userId}.`);
    } finally {
      await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async deleteBackup(id: string): Promise<void> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Backup not found');
    const storageDir = await this.ensureStorageDir();
    await fsp.rm(path.join(storageDir, record.fileName), { force: true }).catch(() => undefined);
    await this.repo.remove(record);
  }

  private async findSuccessfulOrThrow(id: string): Promise<BackupRecord> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record || record.status !== BackupStatus.SUCCESS) throw new NotFoundException('Backup not found');
    return record;
  }

  private async cleanupOldBackups(): Promise<void> {
    const retentionDays = this.config.get<number>('backup.retentionDays') ?? 30;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const stale = await this.repo.createQueryBuilder('b').where('b."createdAt" < :cutoff', { cutoff }).getMany();
    if (!stale.length) return;

    const storageDir = await this.ensureStorageDir();
    for (const record of stale) {
      await fsp.rm(path.join(storageDir, record.fileName), { force: true }).catch(() => undefined);
    }
    await this.repo.remove(stale);
    this.logger.log(`Removed ${stale.length} backup(s) older than ${retentionDays} days.`);
  }

  private async ensureStorageDir(): Promise<string> {
    const dir = path.resolve(this.config.get<string>('backup.storageDir') || './backups');
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  }

  private getEncryptionKey(): Buffer {
    const hex = this.config.get<string>('backup.encryptionKey');
    if (!hex || hex.length !== 64) {
      throw new Error(
        'BACKUP_ENCRYPTION_KEY is not set to a valid 64-character hex string (32 bytes). Generate one with: openssl rand -hex 32',
      );
    }
    return Buffer.from(hex, 'hex');
  }

  private dbCredentials() {
    return {
      host: this.config.get<string>('database.host')!,
      port: this.config.get<number>('database.port')!,
      username: this.config.get<string>('database.username')!,
      password: this.config.get<string>('database.password')!,
      database: this.config.get<string>('database.database')!,
    };
  }

  private async runPgDump(outputPath: string): Promise<void> {
    const { host, port, username, password, database } = this.dbCredentials();
    const pgDump = this.config.get<string>('backup.pgDumpPath') || 'pg_dump';
    await execFileAsync(
      pgDump,
      ['-h', host, '-p', String(port), '-U', username, '-F', 'c', '-f', outputPath, database],
      { env: { ...process.env, PGPASSWORD: password }, maxBuffer: 1024 * 1024 * 64 },
    );
  }

  private async runPgRestore(inputPath: string): Promise<void> {
    const { host, port, username, password, database } = this.dbCredentials();
    const pgRestore = this.config.get<string>('backup.pgRestorePath') || 'pg_restore';
    await execFileAsync(
      pgRestore,
      ['-h', host, '-p', String(port), '-U', username, '-d', database, '--clean', '--if-exists', '--no-owner', inputPath],
      { env: { ...process.env, PGPASSWORD: password }, maxBuffer: 1024 * 1024 * 64 },
    );
  }

  /** AES-256-GCM. Output layout: [12-byte IV][ciphertext][16-byte auth tag]. */
  private async encryptFile(inputPath: string, outputPath: string): Promise<void> {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    await new Promise<void>((resolve, reject) => {
      const input = fs.createReadStream(inputPath);
      const output = fs.createWriteStream(outputPath);
      output.write(iv);
      input.pipe(cipher).pipe(output, { end: false });
      cipher.on('end', () => output.end(cipher.getAuthTag()));
      output.on('finish', resolve);
      output.on('error', reject);
      input.on('error', reject);
      cipher.on('error', reject);
    });
  }

  private async decryptFile(inputPath: string, outputPath: string): Promise<void> {
    const key = this.getEncryptionKey();
    const { size } = await fsp.stat(inputPath);
    const fd = await fsp.open(inputPath, 'r');
    try {
      const iv = Buffer.alloc(IV_LENGTH);
      await fd.read(iv, 0, IV_LENGTH, 0);
      const tag = Buffer.alloc(AUTH_TAG_LENGTH);
      await fd.read(tag, 0, AUTH_TAG_LENGTH, size - AUTH_TAG_LENGTH);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);

      await new Promise<void>((resolve, reject) => {
        const input = fs.createReadStream(inputPath, { start: IV_LENGTH, end: size - AUTH_TAG_LENGTH - 1 });
        const output = fs.createWriteStream(outputPath);
        input.pipe(decipher).pipe(output);
        output.on('finish', resolve);
        output.on('error', reject);
        decipher.on('error', reject);
        input.on('error', reject);
      });
    } finally {
      await fd.close();
    }
  }

  private async uploadToS3(filePath: string, key: string, bucket: string): Promise<void> {
    const accessKeyId = this.config.get<string>('backup.s3.accessKeyId');
    const client = new S3Client({
      region: this.config.get<string>('backup.s3.region'),
      credentials: accessKeyId
        ? { accessKeyId, secretAccessKey: this.config.get<string>('backup.s3.secretAccessKey')! }
        : undefined,
    });
    const body = await fsp.readFile(filePath);
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
  }
}
