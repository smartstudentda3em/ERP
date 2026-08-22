import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AcSupplierPayment } from './entities/ac-supplier-payment.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Company } from '../settings/entities/company.entity';
import { CreateAcSupplierPaymentDto } from './dto/ac-supplier-ledger.dto';
import { CashMovementSourceType, CashMovementType } from '../../entities/enums';
import { CashMovementsService } from '../treasury/cash-movements.service';

/**
 * Air Conditioning company only — supplier payments recorded in this standalone bookkeeping log.
 * A user-entered payment (create()/remove(), the "+ تسجيل دفعة" modal) now DOES draw from a real
 * treasury account (see paymentAccount on the DTO) — by explicit request, this deliberately
 * reverses the log's original "never touches the treasury" design. The internal
 * deductForPurchase()/removeByPurchaseReceipt() pair below is unaffected and stays fully
 * treasury-independent: that path never moves new money, it only marks an already-recorded
 * balance as consumed by a later purchase.
 */
@Injectable()
export class AcSupplierPaymentsService {
  constructor(
    @InjectRepository(AcSupplierPayment) private readonly repo: Repository<AcSupplierPayment>,
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

  /**
   * Draws the payment out of the chosen treasury account (الخزينة النقدي / الرصيد البنكي) and
   * records it as a "دفعة مورد" for the selected supplier in the same transaction — a rejected
   * balance check aborts both, so the two never disagree.
   */
  async create(dto: CreateAcSupplierPaymentDto, companyId: string, createdById: string): Promise<AcSupplierPayment> {
    await this.assertAcCompany(companyId);
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.dataSource.transaction(async (manager) => {
      await this.cashMovementsService.assertSufficientBalance(companyId, dto.paymentAccount, dto.amount, undefined, manager);

      const payment = await manager.getRepository(AcSupplierPayment).save(
        manager.getRepository(AcSupplierPayment).create({
          supplierId: dto.supplierId,
          companyId,
          paymentDate: dto.paymentDate,
          amount: dto.amount,
          notes: dto.notes ?? null,
          createdById,
        }),
      );

      await this.cashMovementsService.record(
        {
          companyId,
          branchId: null,
          movementDate: dto.paymentDate,
          type: CashMovementType.EXPENSE,
          account: dto.paymentAccount,
          amount: dto.amount,
          sourceType: CashMovementSourceType.SUPPLIER_PAYMENT,
          sourceId: payment.id,
          partySupplierId: dto.supplierId,
          description: `AC supplier payment for ${supplier.companyName}`,
          createdById,
        },
        manager,
      );

      return payment;
    });
  }

  /** Reverses whatever treasury movement create() posted (a no-op if this row predates that
   * change, or is one of deductForPurchase's own internal entries, which never had one). */
  async remove(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(AcSupplierPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Payment not found');
      await this.cashMovementsService.removeBySource(companyId, CashMovementSourceType.SUPPLIER_PAYMENT, id, manager);
      await manager.getRepository(AcSupplierPayment).remove(existing);
    });
  }

  /**
   * Called only from PurchaseReceiptsService when an AC purchase receipt's paid-now amount is
   * drawn from "رصيد المورد" instead of a treasury account — inserts a NEGATIVE row into this same
   * standalone ledger so the "دفعات المورد" tab's table and running total directly reflect the
   * consumption, with no separate UI needed. Bypasses CreateAcSupplierPaymentDto's @Min(0.01)
   * validator on purpose: this is an internal deduction, never a normal user-entered payment. Runs
   * inside the caller's own transaction (manager). By explicit request, a purchase paid this way is
   * NEVER blocked for insufficient balance — unlike the treasury accounts (which still reject an
   * overdraft via assertSufficientBalance), رصيد المورد is allowed to go negative and simply shows
   * that negative balance normally, covering the purchase regardless of what the supplier was
   * actually credited beforehand.
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
