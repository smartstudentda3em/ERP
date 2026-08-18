import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SupplierPayment } from '../../parties/suppliers/entities/supplier-payment.entity';
import { Supplier } from '../../parties/suppliers/entities/supplier.entity';
import { PurchaseReceipt } from '../stock-movements/entities/purchase-receipt.entity';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto/supplier-payment.dto';
import { CashMovementAccount, CashMovementSourceType, CashMovementType, PaymentMethod } from '../../../entities/enums';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { CashMovementsService } from '../../treasury/cash-movements.service';
import { CashMovement } from '../../treasury/entities/cash-movement.entity';

/**
 * Records money paid out to a supplier — either against one specific purchase receipt (the
 * per-row "دفع المتبقي" action on PurchasingPage.tsx, which credits that receipt's own
 * paidAmount) or as a general payment on account (the aggregate action on
 * SupplierStatementPage.tsx, purchaseReceiptId omitted). Mirrors SalesPaymentsService's
 * create/update/remove shape exactly, with CashMovementType.EXPENSE (money leaving the business)
 * instead of INCOME and partySupplierId instead of partyCustomerId.
 */
@Injectable()
export class SupplierPaymentsService {
  constructor(
    @InjectRepository(SupplierPayment) private readonly repo: Repository<SupplierPayment>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly cashMovementsService: CashMovementsService,
  ) {}

  async findAll(companyId: string, supplierId?: string) {
    const payments = await this.repo.find({
      where: { companyId, ...(supplierId ? { supplierId } : {}) },
      relations: ['supplier'],
      order: { createdAt: 'DESC' },
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
   * Every company's "سداد المتبقي" modal now offers exactly two methods: نقدي settles into the
   * Cash treasury, تحويل بنكي into Bank (see SupplierStatementPage.tsx/PurchasingPage.tsx). `method`
   * is mandatory on the DTO, so this only needs to map the one non-Cash choice to Bank.
   */
  private resolveAccount(method: PaymentMethod): CashMovementAccount {
    return method === PaymentMethod.BANK_TRANSFER ? CashMovementAccount.BANK : CashMovementAccount.CASH;
  }

  async create(dto: CreateSupplierPaymentDto, createdById: string, companyId: string): Promise<SupplierPayment> {
    // A supplierId belonging to another company must never be accepted — same reasoning as the
    // customerId guard on SalesInvoicesService.create(). 404 so a client can't distinguish
    // "doesn't exist" from "exists in another company".
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const documentNumber = await this.numberingSeriesService.getNextNumber(companyId, 'SUPPLIER_PAYMENT');
    const account = this.resolveAccount(dto.method);

    return this.dataSource.transaction(async (manager) => {
      await this.cashMovementsService.assertSufficientBalance(companyId, account, dto.amount, dto.branchId, manager);

      const movement = await this.cashMovementsService.record(
        {
          companyId,
          branchId: dto.branchId,
          movementDate: dto.paymentDate,
          type: CashMovementType.EXPENSE,
          account,
          amount: dto.amount,
          sourceType: CashMovementSourceType.SUPPLIER_PAYMENT,
          partySupplierId: dto.supplierId,
          description: `Supplier Payment ${documentNumber}`,
          createdById,
        },
        manager,
      );

      const payment = manager.getRepository(SupplierPayment).create({
        documentNumber,
        paymentDate: dto.paymentDate,
        supplierId: dto.supplierId,
        companyId,
        branchId: dto.branchId ?? null,
        purchaseReceiptId: dto.purchaseReceiptId ?? null,
        method: dto.method,
        amount: dto.amount,
        referenceNumber: dto.referenceNumber ?? null,
        notes: dto.notes ?? null,
        createdById,
        cashMovementId: movement.id,
      });
      const savedPayment = await manager.getRepository(SupplierPayment).save(payment);

      if (dto.purchaseReceiptId) {
        await this.applyReceiptPayment(manager, companyId, dto.purchaseReceiptId, Number(dto.amount));
      }

      return savedPayment;
    });
  }

  /** Credits `amount` onto a receipt's paidAmount — the same effect create() applies inline,
   * extracted so update() can reuse it for the (possibly different) receipt a payment is
   * re-attributed to. */
  private async applyReceiptPayment(
    manager: EntityManager,
    companyId: string,
    purchaseReceiptId: string,
    amount: number,
  ): Promise<void> {
    const receiptRepo = manager.getRepository(PurchaseReceipt);
    const receipt = await receiptRepo.findOne({ where: { id: purchaseReceiptId, companyId } });
    if (!receipt) return;
    receipt.paidAmount = Number(receipt.paidAmount) + amount;
    await receiptRepo.save(receipt);
  }

  /** Undoes applyReceiptPayment()'s effect — subtracts `amount` back off paidAmount. Used by
   * update() (reversing a payment's old receipt link before re-applying it to the new one) and
   * remove() (reversing it entirely). */
  private async reverseReceiptPayment(
    manager: EntityManager,
    companyId: string,
    purchaseReceiptId: string,
    amount: number,
  ): Promise<void> {
    const receiptRepo = manager.getRepository(PurchaseReceipt);
    const receipt = await receiptRepo.findOne({ where: { id: purchaseReceiptId, companyId } });
    if (!receipt) return;
    receipt.paidAmount = Math.max(0, Number(receipt.paidAmount) - amount);
    await receiptRepo.save(receipt);
  }

  async update(
    id: string,
    dto: UpdateSupplierPaymentDto,
    updatedById: string,
    companyId: string,
  ): Promise<SupplierPayment> {
    // Same cross-company guard as create() — an edit must never be able to re-point an existing
    // payment at another company's supplier.
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplierId, companyId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(SupplierPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Supplier payment not found');

      const account = this.resolveAccount(dto.method);

      if (existing.purchaseReceiptId) {
        await this.reverseReceiptPayment(manager, companyId, existing.purchaseReceiptId, Number(existing.amount));
      }

      if (existing.cashMovementId) {
        await manager.getRepository(CashMovement).delete({ id: existing.cashMovementId });
      }
      await this.cashMovementsService.assertSufficientBalance(companyId, account, dto.amount, dto.branchId, manager);
      const movement = await this.cashMovementsService.record(
        {
          companyId,
          branchId: dto.branchId,
          movementDate: dto.paymentDate,
          type: CashMovementType.EXPENSE,
          account,
          amount: dto.amount,
          sourceType: CashMovementSourceType.SUPPLIER_PAYMENT,
          partySupplierId: dto.supplierId,
          description: `Supplier Payment ${existing.documentNumber}`,
          createdById: updatedById,
        },
        manager,
      );

      Object.assign(existing, {
        paymentDate: dto.paymentDate,
        supplierId: dto.supplierId,
        branchId: dto.branchId ?? null,
        purchaseReceiptId: dto.purchaseReceiptId ?? null,
        method: dto.method,
        amount: dto.amount,
        referenceNumber: dto.referenceNumber ?? null,
        notes: dto.notes ?? null,
        cashMovementId: movement.id,
      });
      const savedPayment = await manager.getRepository(SupplierPayment).save(existing);

      if (dto.purchaseReceiptId) {
        await this.applyReceiptPayment(manager, companyId, dto.purchaseReceiptId, Number(dto.amount));
      }

      return savedPayment;
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(SupplierPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Supplier payment not found');

      if (existing.purchaseReceiptId) {
        await this.reverseReceiptPayment(manager, companyId, existing.purchaseReceiptId, Number(existing.amount));
      }

      if (existing.cashMovementId) {
        await manager.getRepository(CashMovement).delete({ id: existing.cashMovementId });
      }

      await manager.getRepository(SupplierPayment).remove(existing);
    });
  }
}
