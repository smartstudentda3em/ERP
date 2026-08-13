import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesPayment } from './entities/sales-payment.entity';
import { SalesInvoice } from '../sales-invoices/entities/sales-invoice.entity';
import { CreateSalesPaymentDto, UpdateSalesPaymentDto } from './dto/sales-payment.dto';
import {
  SalesDocumentStatus,
  CashMovementType,
  CashMovementAccount,
  CashMovementSourceType,
  PaymentMethod,
} from '../../../entities/enums';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { CashMovementsService } from '../../treasury/cash-movements.service';
import { CashMovement } from '../../treasury/entities/cash-movement.entity';
import { SalesRepAccessService } from '../../../common/services/sales-rep-access.service';
import { Company } from '../../settings/entities/company.entity';
import { assertPaymentAccountProvided } from '../../../common/utils/payment-account.util';

@Injectable()
export class SalesPaymentsService {
  constructor(
    @InjectRepository(SalesPayment) private readonly repo: Repository<SalesPayment>,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly cashMovementsService: CashMovementsService,
    private readonly salesRepAccess: SalesRepAccessService,
  ) {}

  /** Resolves each payment's `createdById` (the logged-in user who actually recorded the receipt —
   * always set, unlike the optional salesRepresentativeId) to a display name — a plain audit
   * column, not a relation, so this is a raw lookup rather than an ORM join. Same pattern as
   * StockTransfersService.findAll(). */
  async findAll(companyId: string, customerId?: string) {
    const payments = await this.repo.find({
      where: { companyId, ...(customerId ? { customerId } : {}) },
      relations: ['customer', 'invoice', 'salesRepresentative'],
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

  async create(dto: CreateSalesPaymentDto, createdById: string, companyId: string): Promise<SalesPayment> {
    // Non-admins can never attribute a payment to anyone but themselves — see
    // SalesRepAccessService; the client-submitted salesRepresentativeId is ignored for them.
    const salesRepresentativeId = await this.salesRepAccess.resolveSalesRepresentativeId(
      createdById,
      dto.salesRepresentativeId,
      companyId,
    );

    const documentNumber = await this.numberingSeriesService.getNextNumber(companyId, 'SALES_PAYMENT');

    // A مندوب's own follow-up collection routes into their own REP_TREASURY pocket instead of the
    // company's real CASH/BANK — same rule SalesInvoicesService applies to an invoice's upfront
    // payment (see SalesRepAccessService.isSalesAgentRep) — and, like that flow, they never choose
    // an account at all, so the usual paymentAccount requirement never applies to them.
    const isRepTreasurySale = await this.salesRepAccess.isSalesAgentRep(salesRepresentativeId);

    // Press/Stationery/Air Conditioning must explicitly pick the treasury account
    // (dto.paymentAccount) — assertPaymentAccountProvided throws if it's missing for one of these.
    // Any other company has no such field — its receipt only records `method` (cash in hand, bank
    // transfer, cheque, card, online) — so the treasury account is derived from that instead: CASH
    // stays CASH, anything else settles into BANK.
    const company = await this.companyRepo.findOne({ where: { id: companyId } });
    if (!isRepTreasurySale) assertPaymentAccountProvided(company?.code, dto.paymentAccount);
    const resolvedAccount = isRepTreasurySale
      ? CashMovementAccount.REP_TREASURY
      : dto.paymentAccount ??
        (dto.method && dto.method !== PaymentMethod.CASH ? CashMovementAccount.BANK : CashMovementAccount.CASH);

    return this.dataSource.transaction(async (manager) => {
      const movement = await this.cashMovementsService.record(
        {
          companyId,
          branchId: dto.branchId,
          movementDate: dto.paymentDate,
          type: CashMovementType.INCOME,
          account: resolvedAccount,
          // REP_TREASURY is a per-رep pocket — only set when this receipt is actually routing
          // there, same as SalesInvoicesService's own upfront-payment movement.
          salesRepresentativeId: isRepTreasurySale ? salesRepresentativeId : undefined,
          amount: dto.amount,
          sourceType: CashMovementSourceType.SALES_PAYMENT,
          partyCustomerId: dto.customerId,
          description: `Payment ${documentNumber}`,
          createdById,
        },
        manager,
      );

      const payment = manager.getRepository(SalesPayment).create({
        documentNumber,
        paymentDate: dto.paymentDate,
        customerId: dto.customerId ?? null,
        companyId,
        branchId: dto.branchId ?? null,
        invoiceId: dto.invoiceId ?? null,
        salesRepresentativeId,
        method: dto.method ?? PaymentMethod.CASH,
        paymentAccount: resolvedAccount,
        amount: dto.amount,
        referenceNumber: dto.referenceNumber ?? null,
        notes: dto.notes ?? null,
        createdById,
        cashMovementId: movement.id,
      });
      const savedPayment = await manager.getRepository(SalesPayment).save(payment);

      if (dto.invoiceId) {
        const invoiceRepo = manager.getRepository(SalesInvoice);
        const invoice = await invoiceRepo.findOne({ where: { id: dto.invoiceId, companyId } });
        if (invoice) {
          invoice.amountPaid = Number(invoice.amountPaid) + Number(dto.amount);
          invoice.status =
            invoice.amountPaid >= Number(invoice.grandTotal)
              ? SalesDocumentStatus.PAID
              : SalesDocumentStatus.PARTIALLY_PAID;
          await invoiceRepo.save(invoice);
        }
      }

      return savedPayment;
    });
  }

  /** Credits `amount` onto an invoice's amountPaid and recomputes its status — the same logic
   * create() applies inline, extracted so update() can reuse it for the (possibly different)
   * invoice a payment is re-attributed to. */
  private async applyInvoicePayment(
    manager: EntityManager,
    companyId: string,
    invoiceId: string,
    amount: number,
  ): Promise<void> {
    const invoiceRepo = manager.getRepository(SalesInvoice);
    const invoice = await invoiceRepo.findOne({ where: { id: invoiceId, companyId } });
    if (!invoice) return;
    invoice.amountPaid = Number(invoice.amountPaid) + amount;
    invoice.status =
      invoice.amountPaid >= Number(invoice.grandTotal) ? SalesDocumentStatus.PAID : SalesDocumentStatus.PARTIALLY_PAID;
    await invoiceRepo.save(invoice);
  }

  /** Undoes applyInvoicePayment()'s effect — subtracts `amount` back off amountPaid and drops the
   * status back down accordingly. Used by update() (reversing a payment's old invoice link before
   * re-applying it to the new one) and remove() (reversing it entirely). */
  private async reverseInvoicePayment(
    manager: EntityManager,
    companyId: string,
    invoiceId: string,
    amount: number,
  ): Promise<void> {
    const invoiceRepo = manager.getRepository(SalesInvoice);
    const invoice = await invoiceRepo.findOne({ where: { id: invoiceId, companyId } });
    if (!invoice) return;
    invoice.amountPaid = Math.max(0, Number(invoice.amountPaid) - amount);
    invoice.status =
      invoice.amountPaid <= 0
        ? SalesDocumentStatus.CONFIRMED
        : invoice.amountPaid >= Number(invoice.grandTotal)
          ? SalesDocumentStatus.PAID
          : SalesDocumentStatus.PARTIALLY_PAID;
    await invoiceRepo.save(invoice);
  }

  /**
   * Edits an existing receipt in place: reverses its old effect on whichever invoice it was
   * attributed to (if any), replaces its linked cash movement with a fresh one reflecting the
   * edited date/amount/account, then re-applies the (possibly different) new amount to the
   * (possibly different) new invoice. Mirrors PurchaseReceiptsService.update()'s
   * remove-old-then-record-new approach for the cash movement, rather than patching its columns in
   * place — see that method's own comment for why.
   */
  async update(id: string, dto: UpdateSalesPaymentDto, updatedById: string, companyId: string): Promise<SalesPayment> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(SalesPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Sales payment not found');

      const salesRepresentativeId = await this.salesRepAccess.resolveSalesRepresentativeId(
        updatedById,
        dto.salesRepresentativeId,
        companyId,
      );
      const isRepTreasurySale = await this.salesRepAccess.isSalesAgentRep(salesRepresentativeId);
      const company = await this.companyRepo.findOne({ where: { id: companyId } });
      if (!isRepTreasurySale) assertPaymentAccountProvided(company?.code, dto.paymentAccount);
      const resolvedAccount = isRepTreasurySale
        ? CashMovementAccount.REP_TREASURY
        : dto.paymentAccount ??
          (dto.method && dto.method !== PaymentMethod.CASH ? CashMovementAccount.BANK : CashMovementAccount.CASH);

      if (existing.invoiceId) {
        await this.reverseInvoicePayment(manager, companyId, existing.invoiceId, Number(existing.amount));
      }

      // A rep-treasury row already swept (fully or partially) into a settlement transfer must not
      // silently lose that bookkeeping just because the underlying receipt gets edited — the
      // replacement row below starts fresh at settledAmount=0, so any prior settlement is carried
      // forward onto it afterward (capped at the new amount) rather than reappearing as
      // outstanding in the breakdown while its value already left the rep's pocket for good.
      let carriedSettledAmount = 0;
      if (existing.cashMovementId) {
        const oldMovement = await manager.getRepository(CashMovement).findOne({ where: { id: existing.cashMovementId } });
        carriedSettledAmount = Number(oldMovement?.settledAmount ?? 0);
        await manager.getRepository(CashMovement).delete({ id: existing.cashMovementId });
      }
      const movement = await this.cashMovementsService.record(
        {
          companyId,
          branchId: dto.branchId,
          movementDate: dto.paymentDate,
          type: CashMovementType.INCOME,
          account: resolvedAccount,
          salesRepresentativeId: isRepTreasurySale ? salesRepresentativeId : undefined,
          amount: dto.amount,
          sourceType: CashMovementSourceType.SALES_PAYMENT,
          partyCustomerId: dto.customerId,
          description: `Payment ${existing.documentNumber}`,
          createdById: updatedById,
        },
        manager,
      );
      if (carriedSettledAmount > 0.005) {
        movement.settledAmount = Math.min(carriedSettledAmount, Number(dto.amount));
        await manager.getRepository(CashMovement).save(movement);
      }

      Object.assign(existing, {
        paymentDate: dto.paymentDate,
        customerId: dto.customerId ?? null,
        branchId: dto.branchId ?? null,
        invoiceId: dto.invoiceId ?? null,
        salesRepresentativeId,
        method: dto.method ?? PaymentMethod.CASH,
        paymentAccount: resolvedAccount,
        amount: dto.amount,
        referenceNumber: dto.referenceNumber ?? null,
        notes: dto.notes ?? null,
        cashMovementId: movement.id,
      });
      const savedPayment = await manager.getRepository(SalesPayment).save(existing);

      if (dto.invoiceId) {
        await this.applyInvoicePayment(manager, companyId, dto.invoiceId, Number(dto.amount));
      }

      return savedPayment;
    });
  }

  /**
   * Deletes a receipt entirely: reverses its effect on the invoice it was attributed to (if any,
   * restoring the customer's outstanding balance), removes its linked cash movement (restoring
   * whatever it settled onto the treasury balance), then deletes the receipt row itself.
   */
  async remove(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(SalesPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Sales payment not found');

      if (existing.invoiceId) {
        await this.reverseInvoicePayment(manager, companyId, existing.invoiceId, Number(existing.amount));
      }

      if (existing.cashMovementId) {
        await manager.getRepository(CashMovement).delete({ id: existing.cashMovementId });
      }

      await manager.getRepository(SalesPayment).remove(existing);
    });
  }
}
