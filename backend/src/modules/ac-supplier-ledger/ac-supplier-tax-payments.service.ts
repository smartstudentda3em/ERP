import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AcSupplierTaxPayment } from './entities/ac-supplier-tax-payment.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Company } from '../settings/entities/company.entity';
import { CreateAcSupplierTaxPaymentDto } from './dto/ac-supplier-ledger.dto';
import { CashMovementSourceType, CashMovementType } from '../../entities/enums';
import { CashMovementsService } from '../treasury/cash-movements.service';

/**
 * Air Conditioning company only — "ضريبة المبيعات" paid to a supplier, logged from the
 * centralized "الضرائب" tab under الموردون. By explicit request, a recorded entry now DOES draw
 * from a real treasury account (see paymentAccount on the DTO) and posts a linked CashMovement —
 * mirrors AcSupplierPaymentsService's own create()/remove() pattern exactly, just under
 * CashMovementSourceType.SUPPLIER_TAX_PAYMENT instead of SUPPLIER_PAYMENT.
 */
@Injectable()
export class AcSupplierTaxPaymentsService {
  constructor(
    @InjectRepository(AcSupplierTaxPayment) private readonly repo: Repository<AcSupplierTaxPayment>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cashMovementsService: CashMovementsService,
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

  /**
   * Draws the tax amount out of the chosen treasury account (الخزينة النقدي / الرصيد البنكي) and
   * records it as a "ضريبة مورد" entry (or, when supplierId is omitted, an unattributed "ضرائب
   * عامة" entry) in the same transaction — a rejected balance check aborts both, so the two never
   * disagree. Mirrors AcSupplierPaymentsService.create() exactly, plus the general-tax branch.
   */
  async create(
    dto: CreateAcSupplierTaxPaymentDto,
    companyId: string,
    createdById: string,
  ): Promise<AcSupplierTaxPayment> {
    await this.assertAcCompany(companyId);
    let supplier: Supplier | null = null;
    if (dto.supplierId) {
      supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId } });
      if (!supplier) throw new NotFoundException('Supplier not found');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.cashMovementsService.assertSufficientBalance(companyId, dto.paymentAccount, dto.amount, undefined, manager);

      const entry = await manager.getRepository(AcSupplierTaxPayment).save(
        manager.getRepository(AcSupplierTaxPayment).create({
          supplierId: dto.supplierId ?? null,
          companyId,
          taxDate: dto.taxDate,
          amount: dto.amount,
          notes: dto.notes ?? null,
          createdById,
        }),
      );

      await this.cashMovementsService.record(
        {
          companyId,
          branchId: null,
          movementDate: dto.taxDate,
          type: CashMovementType.EXPENSE,
          account: dto.paymentAccount,
          amount: dto.amount,
          sourceType: CashMovementSourceType.SUPPLIER_TAX_PAYMENT,
          sourceId: entry.id,
          partySupplierId: dto.supplierId ?? null,
          description: supplier ? `AC supplier tax payment for ${supplier.companyName}` : 'AC general tax payment',
          createdById,
        },
        manager,
      );

      return entry;
    });
  }

  /** Reverses whatever treasury movement create() posted (a no-op if this row predates that
   * change) before deleting the row — same ordering as AcSupplierPaymentsService.remove(). */
  async remove(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(AcSupplierTaxPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Tax entry not found');
      await this.cashMovementsService.removeBySource(companyId, CashMovementSourceType.SUPPLIER_TAX_PAYMENT, id, manager);
      await manager.getRepository(AcSupplierTaxPayment).remove(existing);
    });
  }
}
