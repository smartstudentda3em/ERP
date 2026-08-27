import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AcSupplierBonus } from './entities/ac-supplier-bonus.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Company } from '../settings/entities/company.entity';
import { CreateAcSupplierBonusDto } from './dto/ac-supplier-ledger.dto';

/**
 * Air Conditioning company only — "البونص" tab under a supplier's own detail page. Deliberately
 * simpler than AcSupplierPaymentsService/AcSupplierTaxPaymentsService: no CashMovementsService
 * dependency and no transaction, since a bonus never touches Cash/Bank by explicit request — it
 * only feeds AcSupplierDetailPage.tsx's own "إجمالي الفواتير بعد البونص"/"الرصيد المتبقي الفعلي"
 * calculations client-side.
 */
@Injectable()
export class AcSupplierBonusesService {
  constructor(
    @InjectRepository(AcSupplierBonus) private readonly repo: Repository<AcSupplierBonus>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private async assertAcCompany(companyId: string): Promise<void> {
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    if (company?.code !== 'AC') {
      throw new BadRequestException('This ledger is only supported for the Air Conditioning company');
    }
  }

  async findAll(companyId: string, supplierId?: string) {
    const rows = await this.repo.find({
      where: { companyId, ...(supplierId ? { supplierId } : {}) },
      order: { bonusDate: 'DESC', createdAt: 'DESC' },
    });
    const userRows = await this.dataSource
      .createQueryBuilder()
      .select('u.id', 'id')
      .addSelect('u."fullName"', 'fullName')
      .from('users', 'u')
      .getRawMany();
    const nameById = new Map<string, string>(userRows.map((u) => [u.id, u.fullName]));
    return rows.map((r) => ({ ...r, createdByName: nameById.get(r.createdById) ?? '—' }));
  }

  async create(dto: CreateAcSupplierBonusDto, companyId: string, createdById: string): Promise<AcSupplierBonus> {
    await this.assertAcCompany(companyId);
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.repo.save(
      this.repo.create({
        supplierId: dto.supplierId,
        companyId,
        bonusDate: dto.bonusDate,
        amount: dto.amount,
        notes: dto.notes ?? null,
        createdById,
      }),
    );
  }

  async remove(id: string, companyId: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Bonus entry not found');
    await this.repo.remove(existing);
  }
}
