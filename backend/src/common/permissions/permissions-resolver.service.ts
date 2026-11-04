import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const CACHE_MS = 20_000;

/**
 * The single source of truth for "what may this user do right now":
 *   founder            → every permission, always;
 *   everyone else      → (permissions of his roles ∪ his GRANT overrides) − his DENY overrides.
 * Read from the database (briefly cached, and dropped the moment the founder saves a user's
 * permissions), never trusted from the JWT — so a revoked operation stops working immediately, not
 * when the token expires.
 */
@Injectable()
export class PermissionsResolver {
  private readonly cache = new Map<string, { codes: string[]; at: number }>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  invalidate(userId?: string) {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }

  /** Permission codes ("sales.invoice.create") his roles alone give him. */
  async roleCodes(userId: string): Promise<string[]> {
    const rows: { code: string }[] = await this.dataSource.query(
      `SELECT DISTINCT p.module || '.' || p.action::text AS code
         FROM user_roles ur
         JOIN role_permissions rp ON rp."roleId" = ur."roleId"
         JOIN permissions p ON p.id = rp."permissionId"
        WHERE ur."userId" = $1`,
      [userId],
    );
    return rows.map((r) => r.code);
  }

  async allCodes(): Promise<string[]> {
    const rows: { code: string }[] = await this.dataSource.query(
      `SELECT p.module || '.' || p.action::text AS code FROM permissions p`,
    );
    return rows.map((r) => r.code);
  }

  async overrides(userId: string): Promise<{ code: string; effect: 'GRANT' | 'DENY' }[]> {
    return this.dataSource.query(
      `SELECT p.module || '.' || p.action::text AS code, up.effect AS effect
         FROM user_permissions up
         JOIN permissions p ON p.id = up."permissionId"
        WHERE up."userId" = $1 AND up."deletedAt" IS NULL`,
      [userId],
    );
  }

  async isFounder(userId: string): Promise<boolean> {
    const rows: { f: boolean }[] = await this.dataSource.query(`SELECT "isFounder" AS f FROM users WHERE id = $1`, [userId]);
    return rows[0]?.f === true;
  }

  async effective(userId: string): Promise<string[]> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.codes;

    let codes: string[];
    if (await this.isFounder(userId)) {
      codes = await this.allCodes();
    } else {
      const set = new Set(await this.roleCodes(userId));
      const overrides = await this.overrides(userId);
      for (const o of overrides) if (o.effect === 'GRANT') set.add(o.code);
      for (const o of overrides) if (o.effect === 'DENY') set.delete(o.code);
      codes = [...set];
    }
    this.cache.set(userId, { codes, at: Date.now() });
    return codes;
  }
}
