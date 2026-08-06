import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SalesPayment } from './entities/sales-payment.entity';
import { SalesInvoice } from '../sales-invoices/entities/sales-invoice.entity';
import { CreateSalesPaymentDto } from './dto/sales-payment.dto';
import {
  SalesDocumentStatus,
  CashMovementType,
  CashMovementAccount,
  CashMovementSourceType,
  PaymentMethod,
} from '../../../entities/enums';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';
import { CashMovementsService } from '../../treasury/cash-movements.service';
import { SalesRepAccessService } from '../../../common/services/sales-rep-access.service';

@Injectable()
export class SalesPaymentsService {
  constructor(
    @InjectRepository(SalesPayment) private readonly repo: Repository<SalesPayment>,
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

    const resolvedAccount = dto.paymentAccount ?? CashMovementAccount.CASH;

    return this.dataSource.transaction(async (manager) => {
      // An incoming payment defaults to the CASH treasury account regardless of the payment
      // method recorded (cash in hand, bank transfer, cheque, ...) — method is kept purely as
      // descriptive metadata on the receipt. dto.paymentAccount lets a caller actually route the
      // money to BANK instead when that distinction matters to them.
      const movement = await this.cashMovementsService.record(
        {
          companyId,
          branchId: dto.branchId,
          movementDate: dto.paymentDate,
          type: CashMovementType.INCOME,
          account: resolvedAccount,
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
}
