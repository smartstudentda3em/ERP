import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AcSupplierPayment } from './entities/ac-supplier-payment.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Company } from '../settings/entities/company.entity';
import { CreateAcSupplierPaymentDto } from './dto/ac-supplier-ledger.dto';

/**
 * Air Conditioning company only — supplier payments recorded as a standalone bookkeeping log,
 * deliberately independent of CashMovementsService/the treasury (see AcSupplierPayment entity
 * comment). Never imports TreasuryModule.
 */
@Injectable()
export class AcSupplierPaymentsService {
  constructor(
    @InjectRepository(AcSupplierPayment) private readonly repo: Repository<AcSupplierPayment>,
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
    const payments = await this.repo.find({
      where: { companyId, ...(supplierId ? { supplierId } : {}) },
      order: { paymentDate: 'DESC', createdAt: 'DESC' },
    });
    const userRows = await this.dataSource
      .createQueryBuilder()
      .select('u.id', 'id')
      .addSelect('u."fullName"', 'fullName')
      .from('users', 'u')
      .getRawMany();
    const nameById = new Map<string, string>(userRows.map((u) => [u.id, u.fullName]));
    return payments.map((p) => ({ ...p, createdByName: nameById.get(p.createdById) ?? '—' }));
  }

  async create(dto: CreateAcSupplierPaymentDto, companyId: string, createdById: string): Promise<AcSupplierPayment> {
    await this.assertAcCompany(companyId);
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const payment = this.repo.create({
      supplierId: dto.supplierId,
      companyId,
      paymentDate: dto.paymentDate,
      amount: dto.amount,
      notes: dto.notes ?? null,
      createdById,
    });
    return this.repo.save(payment);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Payment not found');
    await this.repo.remove(existing);
  }
}
