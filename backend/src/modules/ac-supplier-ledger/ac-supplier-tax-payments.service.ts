import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AcSupplierTaxPayment } from './entities/ac-supplier-tax-payment.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Company } from '../settings/entities/company.entity';
import { CreateAcSupplierTaxPaymentDto } from './dto/ac-supplier-ledger.dto';

/**
 * Air Conditioning company only — "ضريبة المبيعات" paid to a supplier, logged per invoice.
 * Deliberately independent of CashMovementsService/the treasury (see AcSupplierTaxPayment entity
 * comment). Never imports TreasuryModule.
 */
@Injectable()
export class AcSupplierTaxPaymentsService {
  constructor(
    @InjectRepository(AcSupplierTaxPayment) private readonly repo: Repository<AcSupplierTaxPayment>,
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
      order: { taxDate: 'DESC', createdAt: 'DESC' },
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

  async create(
    dto: CreateAcSupplierTaxPaymentDto,
    companyId: string,
    createdById: string,
  ): Promise<AcSupplierTaxPayment> {
    await this.assertAcCompany(companyId);
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const entry = this.repo.create({
      supplierId: dto.supplierId,
      companyId,
      purchaseReceiptId: dto.purchaseReceiptId ?? null,
      taxDate: dto.taxDate,
      amount: dto.amount,
      notes: dto.notes ?? null,
      createdById,
    });
    return this.repo.save(entry);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Tax entry not found');
    await this.repo.remove(existing);
  }
}
