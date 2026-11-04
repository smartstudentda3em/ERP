import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * On every boot (idempotent):
 *  1. makes audit_logs append-only at the database level — UPDATE, DELETE and TRUNCATE are rejected
 *     for every caller, including the application itself and the founder;
 *  2. marks the founder account (the seeded owner) when no founder is set yet.
 * Honest limit: someone with superuser access to the database server itself could still drop the
 * triggers; nothing reachable from the application can.
 */
@Injectable()
export class AuditLogBootstrap implements OnModuleInit {
  private readonly logger = new Logger(AuditLogBootstrap.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE OR REPLACE FUNCTION erp_audit_immutable() RETURNS trigger AS $fn$
        BEGIN
          RAISE EXCEPTION 'سجل الإجراءات لا يمكن تعديله أو حذفه' USING ERRCODE = 'P0001';
        END
        $fn$ LANGUAGE plpgsql;
      `);
      await this.dataSource.query(`DROP TRIGGER IF EXISTS erp_audit_no_change ON "audit_logs"`);
      await this.dataSource.query(
        `CREATE TRIGGER erp_audit_no_change BEFORE UPDATE OR DELETE ON "audit_logs"
         FOR EACH ROW EXECUTE FUNCTION erp_audit_immutable()`,
      );
      await this.dataSource.query(`DROP TRIGGER IF EXISTS erp_audit_no_truncate ON "audit_logs"`);
      await this.dataSource.query(
        `CREATE TRIGGER erp_audit_no_truncate BEFORE TRUNCATE ON "audit_logs"
         FOR EACH STATEMENT EXECUTE FUNCTION erp_audit_immutable()`,
      );
    } catch (err) {
      this.logger.error(`AUDIT-LOG IMMUTABILITY NOT INSTALLED: ${(err as Error).message}`);
    }

    try {
      const email = this.config.get<string>('seed.adminEmail');
      await this.dataSource.query(
        `UPDATE users SET "isFounder" = true
         WHERE email = $1 AND NOT EXISTS (SELECT 1 FROM users WHERE "isFounder" = true)`,
        [email],
      );
    } catch (err) {
      this.logger.error(`Founder flag not set: ${(err as Error).message}`);
    }
  }
}
