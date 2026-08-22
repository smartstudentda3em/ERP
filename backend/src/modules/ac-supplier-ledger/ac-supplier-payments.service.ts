import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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

  /**
   * Called only from PurchaseReceiptsService when an AC purchase receipt's paid-now amount is
   * drawn from "رصيد المورد" instead of a treasury account — inserts a NEGATIVE row into this same
   * standalone ledger so the "دفعات المورد" tab's table and running total directly reflect the
   * consumption, with no separate UI needed. Bypasses CreateAcSupplierPaymentDto's @Min(0.01)
   * validator on purpose: this is an internal deduction, never a normal user-entered payment. Runs
   * inside the caller's own transaction (manager), and throws if the supplier's current balance
   * can't cover it — mirrors CashMovementsService.assertSufficientBalance for the treasury path.
   */
  async deductForPurchase(
    supplierId: string,
    companyId: string,
    amount: number,
    purchaseReceiptId: string,
    documentNumber: string,
    createdById: string,
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(AcSupplierPayment);
    const row = await repo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .where('p."supplierId" = :supplierId AND p."companyId" = :companyId', { supplierId, companyId })
      .getRawOne<{ sum: string }>();
    if (Number(row?.sum ?? 0) < amount) {
      throw new BadRequestException('رصيد المورد غير كافٍ لتغطية هذا المبلغ');
    }
    await repo.save(
      repo.create({
        supplierId,
        companyId,
        paymentDate: new Date().toISOString().slice(0, 10),
        amount: -amount,
        purchaseReceiptId,
        notes: `خصم تلقائي مقابل فاتورة مشتريات رقم ${documentNumber}`,
        createdById,
      }),
    );
  }

  /** Reverses deductForPurchase — called before an AC purchase receipt paid from "رصيد المورد" is
   * edited or deleted, mirroring CashMovementsService.removeBySource for the treasury path. A
   * no-op (deletes zero rows) when the receipt was never paid this way. */
  async removeByPurchaseReceipt(purchaseReceiptId: string, companyId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(AcSupplierPayment).delete({ purchaseReceiptId, companyId });
  }
}
