import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { PaginatedResult, PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@Injectable()
export class AuditLogService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<AuditLog>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;

    const qb = this.repo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC');

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
