import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ShipmentPayment } from './entities/shipment-payment.entity';
import { Shipment } from './entities/shipment.entity';
import { CreateShipmentPaymentDto, UpdateShipmentPaymentDto } from './dto/shipment-payment.dto';
import { CashMovementSourceType, CashMovementType, ShipmentPaymentType } from '../../entities/enums';
import { NumberingSeriesService } from '../settings/numbering-series.controller';
import { CashMovementsService } from '../treasury/cash-movements.service';

@Injectable()
export class ShipmentPaymentsService {
  constructor(
    @InjectRepository(ShipmentPayment) private readonly repo: Repository<ShipmentPayment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
    private readonly cashMovementsService: CashMovementsService,
  ) {}

  findAll(companyId: string) {
    return this.repo.find({
      where: { companyId },
      relations: ['shipment'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<ShipmentPayment> {
    const payment = await this.repo.findOne({ where: { id, companyId }, relations: ['shipment'] });
    if (!payment) throw new NotFoundException('Shipment payment not found');
    return payment;
  }

  async create(dto: CreateShipmentPaymentDto, createdById: string, companyId: string): Promise<ShipmentPayment> {
    return this.dataSource.transaction(async (manager) => {
      const shipment = await manager.getRepository(Shipment).findOne({ where: { id: dto.shipmentId, companyId } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      // SHIPPING_COST is a memo-only record of freight spend, never a real payment — it must never
      // touch the treasury balance (no balance check, no CashMovement), unlike every other payment
      // type here which actually moves money out of CASH/BANK.
      const isMemoOnly = dto.paymentType === ShipmentPaymentType.SHIPPING_COST;

      // Checked before any row is written — a rejected payment (Printing Press only; see
      // assertSufficientBalance) must abort here, before the payment record or its cash movement
      // exist at all.
      if (!isMemoOnly) {
        await this.cashMovementsService.assertSufficientBalance(companyId, dto.account, dto.amount, undefined, manager);
      }

      const documentNumber =
        (await this.numberingSeriesService.tryGetNextNumber(companyId, 'SHIPMENT_PAYMENT')) ??
        `SHPMT-${Date.now()}`;

      const payment = manager.getRepository(ShipmentPayment).create({
        companyId,
        documentNumber,
        paymentDate: dto.paymentDate,
        shipmentId: dto.shipmentId,
        paymentType: dto.paymentType,
        amount: dto.amount,
        account: dto.account,
        notes: dto.notes ?? null,
        createdById,
      });
      const savedPayment = await manager.getRepository(ShipmentPayment).save(payment);

      if (!isMemoOnly) {
        await this.cashMovementsService.record(
          {
            companyId,
            movementDate: dto.paymentDate,
            type: CashMovementType.EXPENSE,
            account: dto.account,
            amount: dto.amount,
            sourceType: CashMovementSourceType.SHIPMENT_PAYMENT,
            sourceId: savedPayment.id,
            description: `Shipment payment ${documentNumber}`,
            createdById,
          },
          manager,
        );
      }

      return savedPayment;
    });
  }

  async update(
    id: string,
    dto: UpdateShipmentPaymentDto,
    companyId: string,
  ): Promise<ShipmentPayment> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(ShipmentPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Shipment payment not found');

      const shipment = await manager.getRepository(Shipment).findOne({ where: { id: dto.shipmentId, companyId } });
      if (!shipment) throw new NotFoundException('Shipment not found');

      // Old movement removed first (delete-then-recreate, same reasoning as
      // PurchaseReceiptsService.update()/removeBySource) so the balance check below already
      // reflects its removal — nothing after this point may throw. A no-op if the payment being
      // edited was already SHIPPING_COST (never had a movement to begin with).
      await this.cashMovementsService.removeBySource(companyId, CashMovementSourceType.SHIPMENT_PAYMENT, id, manager);

      // SHIPPING_COST is a memo-only record — never re-checked against the balance, and no
      // movement is re-recorded below. Switching a payment's type to/from SHIPPING_COST on edit is
      // exactly how this correctly starts/stops affecting the treasury.
      const isMemoOnly = dto.paymentType === ShipmentPaymentType.SHIPPING_COST;
      if (!isMemoOnly) {
        await this.cashMovementsService.assertSufficientBalance(companyId, dto.account, dto.amount, undefined, manager);
      }

      Object.assign(existing, {
        paymentDate: dto.paymentDate,
        shipmentId: dto.shipmentId,
        paymentType: dto.paymentType,
        amount: dto.amount,
        account: dto.account,
        notes: dto.notes ?? null,
      });
      const savedPayment = await manager.getRepository(ShipmentPayment).save(existing);

      if (!isMemoOnly) {
        await this.cashMovementsService.record(
          {
            companyId,
            movementDate: dto.paymentDate,
            type: CashMovementType.EXPENSE,
            account: dto.account,
            amount: dto.amount,
            sourceType: CashMovementSourceType.SHIPMENT_PAYMENT,
            sourceId: id,
            description: `Shipment payment ${existing.documentNumber}`,
            createdById: existing.createdById,
          },
          manager,
        );
      }

      return savedPayment;
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(ShipmentPayment).findOne({ where: { id, companyId } });
      if (!existing) throw new NotFoundException('Shipment payment not found');

      await this.cashMovementsService.removeBySource(companyId, CashMovementSourceType.SHIPMENT_PAYMENT, id, manager);
      await manager.getRepository(ShipmentPayment).remove(existing);
    });
  }
}
