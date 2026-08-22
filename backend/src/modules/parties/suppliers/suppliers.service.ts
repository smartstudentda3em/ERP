import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService, rethrowFriendlyDbError } from '../../../common/services/base-crud.service';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';

@Injectable()
export class SuppliersService extends BaseCrudService<Supplier> {
  constructor(
    @InjectRepository(Supplier) repo: Repository<Supplier>,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {
    super(repo);
  }

  findAllForCompany(companyId: string): Promise<Supplier[]> {
    return this.repo.find({ where: { companyId }, relations: ['currency'], order: { createdAt: 'ASC' } as any });
  }

  /** Scoped to the caller's company — an id that belongs to another company 404s exactly like an id that doesn't exist at all, so ids can't be probed cross-company. */
  async findOneScoped(id: string, companyId: string): Promise<Supplier> {
    const supplier = await this.repo.findOne({ where: { id, companyId }, relations: ['currency'] });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async createForCompany(dto: CreateSupplierDto, companyId: string): Promise<Supplier> {
    let code = dto.code;
    if (code) {
      const existing = await this.repo.findOne({ where: { companyId, code } });
      if (existing) throw new ConflictException('Supplier code already exists');
    } else {
      code = (await this.numberingSeriesService.tryGetNextNumber(companyId, 'SUPPLIER')) ?? `SUPP-${Date.now()}`;
    }
    return super.create({ ...dto, companyId, code } as any);
  }

  async updateScoped(id: string, companyId: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOneScoped(id, companyId);
    Object.assign(supplier, dto);
    return this.repo.save(supplier);
  }

  /** No application-level dependent check needed — RESTRICT-protected at the DB level from
   * PurchaseReceipt/SupplierPayment/AcSupplierPayment/AcSupplierTaxPayment/ImportCargoItem.
   * rethrowFriendlyDbError turns that DB-level block into a clear message instead of a raw 500. */
  async removeScoped(id: string, companyId: string): Promise<void> {
    const supplier = await this.findOneScoped(id, companyId);
    try {
      await this.repo.remove(supplier);
    } catch (err) {
      rethrowFriendlyDbError(err);
    }
  }
}
