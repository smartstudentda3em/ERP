import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class AuditLogService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async findAll(query: PaginationQueryDto, user: AuthenticatedUser): Promise<PaginatedResult<AuditLog>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC');

    // A non-Administrator only ever sees their own company's audit trail — the interceptor
    // stamps every row with the writer's companyId (nullable only for pre-auth events like a
    // failed login, which have no company yet), so this can never leak another company's activity.
    if (!user.allCompanies) {
      qb.andWhere('log."companyId" = :companyId', { companyId: user.companyId });
    }

    if (query.search) {
      qb.andWhere(
        '(log.userEmail ILIKE :s OR log.path ILIKE :s OR log.module ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
