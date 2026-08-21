import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SharedDocument } from './entities/shared-document.entity';

export interface StoredSharedDocument {
  id: string;
  filePath: string;
  originalFilename: string;
  mimeType: string;
}

@Injectable()
export class SharedDocumentsService {
  private readonly logger = new Logger(SharedDocumentsService.name);
  private readonly storageDir: string;
  private readonly retentionDays: number;

  constructor(
    @InjectRepository(SharedDocument) private readonly repo: Repository<SharedDocument>,
    private readonly config: ConfigService,
  ) {
    this.storageDir = path.resolve(this.config.get<string>('sharedDocuments.storageDir') || './uploads/shared-documents');
    this.retentionDays = this.config.get<number>('sharedDocuments.retentionDays') ?? 14;
  }

  /**
   * Writes the file to disk before inserting the DB row (not the other way around) — an orphaned
   * file with no row is harmless dead weight the cleanup cron will never find, but an orphaned row
   * pointing at a file that was never actually written would 404 on every read.
   */
  async save(
    buffer: Buffer,
    originalFilename: string,
    mimeType: string,
    companyId: string,
    createdById: string,
  ): Promise<StoredSharedDocument> {
    const id = uuidv4();
    await fsp.mkdir(this.storageDir, { recursive: true });
    const filePath = path.join(this.storageDir, `${id}.pdf`);
    await fsp.writeFile(filePath, buffer);

    const record = this.repo.create({ id, originalFilename, mimeType, companyId, createdById });
    await this.repo.save(record);

    return { id, filePath, originalFilename, mimeType };
  }

  async getFile(id: string): Promise<StoredSharedDocument> {
    const record = await this.repo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('Shared document not found or expired');
    const filePath = path.join(this.storageDir, `${id}.pdf`);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Shared document not found or expired');
    return { id, filePath, originalFilename: record.originalFilename, mimeType: record.mimeType };
  }

  /** Run by SharedDocumentsCleanupCron — these are meant to be opened within minutes of being
   * shared, not kept indefinitely as a public, unauthenticated file host. */
  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - this.retentionDays * 24 * 60 * 60 * 1000);
    const expired = await this.repo.find({ where: { createdAt: LessThan(cutoff) } });
    for (const record of expired) {
      const filePath = path.join(this.storageDir, `${record.id}.pdf`);
      await fsp.rm(filePath, { force: true }).catch((err) => {
        this.logger.warn(`Failed to remove expired shared document file ${filePath}: ${(err as Error).message}`);
      });
    }
    if (expired.length) await this.repo.remove(expired);
    return expired.length;
  }
}
