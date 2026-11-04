import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  QueryRunner,
  RemoveEvent,
  SoftRemoveEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent,
  UpdateEvent,
} from 'typeorm';
import { EntityMetadata } from 'typeorm/metadata/EntityMetadata';
import { AuditActionType, AuditLog } from './entities/audit-log.entity';
import { auditStorage } from './audit-context';
import { AuditRecorder } from './audit-recorder.service';
import { IGNORED_COLUMNS, MODEL_LABELS, buildDescription, isSkippedTable, redact } from './audit-labels';

/**
 * Records every create / update / delete of a business record, with its old and new values, against
 * the user who made the request. Rows are buffered per transaction and written only once it
 * COMMITS (a rolled-back change leaves no trace) and on a separate connection, so auditing can never
 * break or slow down — let alone be rolled back with — the operation it observes.
 *
 * Scope: changes made through the ORM (save / remove / softRemove), which is how the app writes its
 * business data. Raw-SQL / query-builder bulk updates bypass ORM events; those requests still get a
 * REQUEST row from AuditLogInterceptor, so nothing disappears silently — it just carries no old/new.
 */
@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface {
  private readonly logger = new Logger(AuditSubscriber.name);
  private readonly pending = new WeakMap<QueryRunner, Partial<AuditLog>[]>();

  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly recorder: AuditRecorder,
  ) {
    dataSource.subscribers.push(this);
  }

  afterInsert(event: InsertEvent<any>) {
    return this.capture(event.metadata, event.queryRunner, 'CREATE', null, event.entity);
  }

  afterUpdate(event: UpdateEvent<any>) {
    return this.capture(event.metadata, event.queryRunner, 'UPDATE', event.databaseEntity, event.entity, event.updatedColumns.map((c) => c.propertyName));
  }

  afterRemove(event: RemoveEvent<any>) {
    return this.capture(event.metadata, event.queryRunner, 'DELETE', event.databaseEntity ?? event.entity, null, undefined, event.entityId);
  }

  afterSoftRemove(event: SoftRemoveEvent<any>) {
    return this.capture(event.metadata, event.queryRunner, 'DELETE', event.databaseEntity ?? event.entity, null, undefined, event.entityId);
  }

  async afterTransactionCommit(event: TransactionCommitEvent) {
    const rows = this.pending.get(event.queryRunner);
    if (!rows) return;
    this.pending.delete(event.queryRunner);
    void this.recorder.insert(rows);
  }

  afterTransactionRollback(event: TransactionRollbackEvent) {
    this.pending.delete(event.queryRunner);
  }

  /** Plain, JSON-safe copy of the mapped columns of an entity (relations are not followed). */
  private columnsOf(metadata: EntityMetadata, entity: any, only?: string[]): Record<string, unknown> | null {
    if (!entity) return null;
    const out: Record<string, unknown> = {};
    for (const col of metadata.columns) {
      if (only && !only.includes(col.propertyName)) continue;
      const v = col.getEntityValue(entity);
      if (v === undefined) continue;
      out[col.propertyName] = v;
    }
    return JSON.parse(JSON.stringify(out));
  }

  private async capture(
    metadata: EntityMetadata,
    queryRunner: QueryRunner,
    op: 'CREATE' | 'UPDATE' | 'DELETE',
    oldEntity: any,
    newEntity: any,
    updatedProps?: string[],
    entityId?: unknown,
  ) {
    try {
      const table = metadata.tableName;
      if (isSkippedTable(table)) return;

      let changed: string[] | undefined;
      if (op === 'UPDATE') {
        changed = (updatedProps ?? []).filter((p) => !IGNORED_COLUMNS.has(p));
        if (!changed.length) return;
      }
      const oldValues = redact(op === 'CREATE' ? null : this.columnsOf(metadata, oldEntity, changed));
      const newValues = redact(op === 'DELETE' ? null : this.columnsOf(metadata, newEntity, changed));
      const source = newEntity ?? oldEntity ?? {};
      const full = { ...(oldEntity ?? {}), ...(newEntity ?? {}) };

      const ctx = auditStorage.getStore();
      const actor = await this.recorder.snapshot(ctx);
      // Sign-in / company-switch only touch the user row as bookkeeping (active company, last login) —
      // the LOGIN request row already covers it, so it isn't a "user was modified" event.
      if (/\/auth\/(login|refresh|switch-company|logout)/.test(actor.path)) return;
      const companyId: string | null = full.companyId ?? actor.companyId ?? null;
      const modelLabel = MODEL_LABELS[table] ?? table;
      const ref: string | null =
        table === 'month_closings' && full.year
          ? `${full.year}-${String(full.month).padStart(2, '0')}`
          : (full.documentNumber ?? full.name ?? full.nameAr ?? full.fullName ?? full.code ?? null);

      let actionType: AuditActionType = op;
      if (op === 'UPDATE' && /\/(approve|confirm|post|finalize)(\/|\?|$)/.test(actor.path)) actionType = 'APPROVE';

      const row: Partial<AuditLog> = {
        companyId,
        userId: actor.userId,
        userEmail: actor.userEmail,
        userName: actor.userName,
        userRole: actor.userRole,
        departmentName: await this.recorder.companyName(companyId),
        method: actor.method,
        path: actor.path,
        module: table,
        action: actionType,
        actionType,
        source: 'CHANGE',
        targetModel: table,
        targetLabel: modelLabel,
        entityId: String(source.id ?? entityId ?? '').slice(0, 64) || null,
        oldValues,
        newValues,
        description: buildDescription(actionType, modelLabel, ref, changed, table === 'month_closings' ? { isClosed: Boolean(full.isClosed) } : undefined),
        requestBody: null,
        statusCode: 200,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        durationMs: null,
      };
      if (ctx) ctx.changeCount++;

      if (queryRunner?.isTransactionActive) {
        const rows = this.pending.get(queryRunner) ?? [];
        rows.push(row);
        this.pending.set(queryRunner, rows);
      } else {
        void this.recorder.insert([row]);
      }
    } catch (err) {
      // Auditing must never break the operation it observes.
      this.logger.error(`Audit capture failed: ${(err as Error).message}`);
    }
  }
}
