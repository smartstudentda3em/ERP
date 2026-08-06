import { NotFoundException } from '@nestjs/common';
import { DeepPartial, FindOptionsWhere, Repository } from 'typeorm';

/**
 * Thin base for simple lookup/master-data entities (settings, categories, etc.)
 * that only need find-all/find-one/create/update/remove with no extra business logic.
 * Modules with real workflow (posting, stock, RBAC) implement their own service instead.
 */
export abstract class BaseCrudService<T extends { id: string }> {
  protected constructor(protected readonly repo: Repository<T>) {}

  findAll(where?: FindOptionsWhere<T>): Promise<T[]> {
    return this.repo.find({ where, order: { createdAt: 'ASC' } as any });
  }

  async findOne(id: string): Promise<T> {
    const entity = await this.repo.findOne({ where: { id } as FindOptionsWhere<T> });
    if (!entity) throw new NotFoundException(`${this.repo.metadata.name} not found`);
    return entity;
  }

  create(dto: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async update(id: string, dto: DeepPartial<T>): Promise<T> {
    const entity = await this.findOne(id);
    Object.assign(entity as object, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<void> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
  }
}

/**
 * Same as BaseCrudService, but every operation is scoped to a single company — the companyId
 * always comes from the caller's authenticated session (`@CurrentUser('companyId')`), never from
 * a client-supplied query param or request body, so one company's master data is never visible or
 * editable from another company's session. findOne/update/remove all 404 (not just silently no-op)
 * when the row exists but belongs to a different company, so IDs can't be probed cross-company.
 */
export abstract class CompanyScopedCrudService<
  T extends { id: string; companyId: string },
> extends BaseCrudService<T> {
  findAllForCompany(companyId: string): Promise<T[]> {
    return this.repo.find({ where: { companyId } as FindOptionsWhere<T>, order: { createdAt: 'ASC' } as any });
  }

  async findOneForCompany(id: string, companyId: string): Promise<T> {
    const entity = await this.repo.findOne({ where: { id, companyId } as FindOptionsWhere<T> });
    if (!entity) throw new NotFoundException(`${this.repo.metadata.name} not found`);
    return entity;
  }

  createForCompany(companyId: string, dto: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create({ ...dto, companyId } as DeepPartial<T>);
    return this.repo.save(entity);
  }

  async updateForCompany(id: string, companyId: string, dto: DeepPartial<T>): Promise<T> {
    const entity = await this.findOneForCompany(id, companyId);
    Object.assign(entity as object, dto, { companyId });
    return this.repo.save(entity);
  }

  async removeForCompany(id: string, companyId: string): Promise<void> {
    const entity = await this.findOneForCompany(id, companyId);
    await this.repo.remove(entity);
  }
}
