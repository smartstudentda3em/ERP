import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { MODEL_LABELS } from './audit-labels';

export interface AuditLogQuery {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  companyId?: string;
  actionType?: string;
  targetModel?: string;
  source?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Read-only by design — there is deliberately no update/delete method anywhere in this service. */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async findAll(query: AuditLogQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));

    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC').addOrderBy('log.id', 'DESC');
    if (query.userId) qb.andWhere('log."userId" = :userId', { userId: query.userId });
    if (query.companyId) qb.andWhere('log."companyId" = :companyId', { companyId: query.companyId });
    if (query.actionType) qb.andWhere('log."actionType" = :actionType', { actionType: query.actionType });
    if (query.targetModel) qb.andWhere('log."targetModel" = :targetModel', { targetModel: query.targetModel });
    if (query.source) qb.andWhere('log.source = :source', { source: query.source });
    // Dates are the owner's local (Cairo) calendar days, not UTC ones.
    if (query.dateFrom) qb.andWhere(`(log."createdAt" AT TIME ZONE 'Africa/Cairo')::date >= :dateFrom`, { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere(`(log."createdAt" AT TIME ZONE 'Africa/Cairo')::date <= :dateTo`, { dateTo: query.dateTo });
    if (query.search) {
      qb.andWhere(
        `(log.description ILIKE :s OR log."userName" ILIKE :s OR log."userEmail" ILIKE :s OR log."entityId" ILIKE :s OR log.path ILIKE :s)`,
        { s: `%${query.search}%` },
      );
    }

    const [items, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** Values for the filter dropdowns — only what actually appears in the log. */
  async filterOptions() {
    const users: { id: string; name: string }[] = await this.dataSource.query(
      `SELECT "userId" AS id, MAX("userName") AS name FROM audit_logs
       WHERE "userId" IS NOT NULL GROUP BY "userId" ORDER BY MAX("userName")`,
    );
    const companies: { id: string; name: string }[] = await this.dataSource.query(
      `SELECT id, COALESCE("nameAr", "nameEn") AS name FROM companies ORDER BY 2`,
    );
    const models: { m: string }[] = await this.dataSource.query(
      `SELECT DISTINCT "targetModel" AS m FROM audit_logs WHERE "targetModel" IS NOT NULL`,
    );
    return {
      users,
      companies,
      targetModels: models.map((r) => ({ key: r.m, label: MODEL_LABELS[r.m] ?? r.m })),
    };
  }
}
