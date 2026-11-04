import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditContext } from './audit-context';

export interface ActorSnapshot {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userRole: string | null;
  companyId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string;
  path: string;
}

const CACHE_MS = 5 * 60 * 1000;

/** Resolves who/where for an audit row (with small caches — this runs on every change) and writes rows. */
@Injectable()
export class AuditRecorder {
  private readonly logger = new Logger(AuditRecorder.name);
  private readonly roleCache = new Map<string, { value: string; at: number }>();
  private readonly companyCache = new Map<string, { value: string; at: number }>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private async roleNames(userId: string): Promise<string> {
    const hit = this.roleCache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const rows: { name: string }[] = await this.dataSource.query(
      `SELECT r.name FROM user_roles ur INNER JOIN roles r ON r.id = ur."roleId" WHERE ur."userId" = $1`,
      [userId],
    );
    const value = rows.map((r) => r.name).join('، ');
    this.roleCache.set(userId, { value, at: Date.now() });
    return value;
  }

  async companyName(companyId: string | null | undefined): Promise<string | null> {
    if (!companyId) return null;
    const hit = this.companyCache.get(companyId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const rows: { n: string }[] = await this.dataSource.query(
      `SELECT COALESCE("nameAr", "nameEn") AS n FROM companies WHERE id = $1`,
      [companyId],
    );
    const value = rows[0]?.n ?? null;
    if (value) this.companyCache.set(companyId, { value, at: Date.now() });
    return value;
  }

  /** Who is acting. Outside any HTTP request (cron jobs, startup) the actor is "النظام". */
  async snapshot(ctx: AuditContext | undefined, overrideUser?: { id: string; fullName: string; email?: string | null; companyId?: string | null }): Promise<ActorSnapshot> {
    const req = ctx?.request;
    const user = overrideUser
      ? { userId: overrideUser.id, fullName: overrideUser.fullName, email: overrideUser.email ?? null, companyId: overrideUser.companyId ?? null }
      : req?.user;
    const userId: string | null = user?.userId ?? user?.id ?? null;
    let userRole: string | null = null;
    if (userId) {
      try {
        userRole = (await this.roleNames(userId)) || null;
      } catch {
        userRole = null;
      }
    }
    return {
      userId,
      userEmail: user?.email ?? null,
      userName: userId ? (user?.fullName ?? null) : req ? null : 'النظام',
      userRole,
      companyId: user?.companyId ?? null,
      // Behind nginx req.ip is the proxy's own address — the real client is the first X-Forwarded-For hop.
      ipAddress: (((req?.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req?.ip) ?? null)?.slice(0, 64) ?? null,
      userAgent: (req?.headers?.['user-agent'] as string | undefined)?.slice(0, 300) ?? null,
      method: req?.method ?? 'SYSTEM',
      path: (req?.originalUrl || req?.url || '').slice(0, 300),
    };
  }

  /** Writes rows on their own connection — never inside (and so never able to poison) a business transaction. */
  async insert(rows: Partial<AuditLog>[]): Promise<void> {
    if (!rows.length) return;
    try {
      await this.dataSource.getRepository(AuditLog).insert(rows as any);
    } catch (err) {
      this.logger.error(`Failed to write audit rows: ${(err as Error).message}`);
    }
  }
}
