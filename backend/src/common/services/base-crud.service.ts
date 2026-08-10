import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeepPartial, FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';

/**
 * Every master-data screen in Settings is a thin generic form (SimpleMasterList.tsx) driving one
 * of these CRUD endpoints — none of them handle DB errors themselves, so an unmapped Postgres
 * error code reaches the client as a raw 500 with Postgres's own wording (or worse, was swallowed
 * entirely client-side before SimpleMasterList's onError was added). This translates the two
 * ways a save can fail at the DB layer after passing DTO validation into exceptions the frontend's
 * getErrorMessage()/toast already knows how to show:
 *  - 23505 unique_violation — e.g. a currency code, tax code, branch code already in use.
 *  - 22001 string_data_right_truncation — a value too long for its column (surfaced as a
 *    validation-style message rather than "value too long for type character varying(10)").
 * Any other Postgres error code still propagates as-is (an unmapped 500 is correct there — it's
 * not something the caller could have fixed by re-entering the form).
 */
function rethrowFriendlyDbError(err: unknown): never {
  if (err instanceof QueryFailedError) {
    const code = (err as QueryFailedError & { code?: string }).code;
    if (code === '23505') {
      throw new ConflictException('القيمة المدخلة مستخدمة بالفعل — يرجى اختيار قيمة أخرى (تحقق من الكود/الرمز).');
    }
    if (code === '22001') {
      throw new BadRequestException('أحد الحقول يتجاوز الحد الأقصى المسموح به لعدد الأحرف.');
    }
  }
  throw err;
}

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

  async create(dto: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create(dto);
    try {
      return await this.repo.save(entity);
    } catch (err) {
      rethrowFriendlyDbError(err);
    }
  }

  async update(id: string, dto: DeepPartial<T>): Promise<T> {
    const entity = await this.findOne(id);
    Object.assign(entity as object, dto);
    try {
      return await this.repo.save(entity);
    } catch (err) {
      rethrowFriendlyDbError(err);
    }
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

  async createForCompany(companyId: string, dto: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create({ ...dto, companyId } as DeepPartial<T>);
    try {
      return await this.repo.save(entity);
    } catch (err) {
      rethrowFriendlyDbError(err);
    }
  }

  async updateForCompany(id: string, companyId: string, dto: DeepPartial<T>): Promise<T> {
    const entity = await this.findOneForCompany(id, companyId);
    Object.assign(entity as object, dto, { companyId });
    try {
      return await this.repo.save(entity);
    } catch (err) {
      rethrowFriendlyDbError(err);
    }
  }

  async removeForCompany(id: string, companyId: string): Promise<void> {
    const entity = await this.findOneForCompany(id, companyId);
    await this.repo.remove(entity);
  }
}
