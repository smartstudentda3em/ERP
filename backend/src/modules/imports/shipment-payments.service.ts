import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ShipmentPayment } from './entities/shipment-payment.entity';
import { Shipment } from './entities/shipment.entity';
import { CreateShipmentPaymentDto, UpdateShipmentPaymentDto } from './dto/shipment-payment.dto';
import { NumberingSeriesService } from '../settings/numbering-series.controller';

/**
 * The whole Import module (shipments, shipment expenses, cargo items, and this payments log) is a
 * standalone statistical unit for aggregating a shipment's total cost — it is deliberately severed
 * from the general financial system. A shipment payment here (deposit/partial/final settlement/
 * shipping-cost memo) never creates, checks, or removes a CashMovement, and never moves the
 * treasury's CASH/BANK balance — `paymentType` and `account` are purely descriptive breakdown
 * fields for the shipment's own cost history. Only Suppliers/SupplierPayments remain wired to
 * CashMovementsService (see supplier-payments.service.ts) — that is the sole financially-connected
 * part of this area, by design.
 */
@Injectable()
export class ShipmentPaymentsService {
  constructor(
    @InjectRepository(ShipmentPayment) private readonly repo: Repository<ShipmentPayment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly numberingSeriesService: NumberingSeriesService,
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
    const shipment = await this.dataSource
      .getRepository(Shipment)
      .findOne({ where: { id: dto.shipmentId, companyId } });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const documentNumber =
      (await this.numberingSeriesService.tryGetNextNumber(companyId, 'SHIPMENT_PAYMENT')) ?? `SHPMT-${Date.now()}`;

    const payment = this.repo.create({
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
    return this.repo.save(payment);
  }

  async update(id: string, dto: UpdateShipmentPaymentDto, companyId: string): Promise<ShipmentPayment> {
    const existing = await this.repo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Shipment payment not found');

    const shipment = await this.dataSource
      .getRepository(Shipment)
      .findOne({ where: { id: dto.shipmentId, companyId } });
    if (!shipment) throw new NotFoundException('Shipment not found');

    Object.assign(existing, {
      paymentDate: dto.paymentDate,
      shipmentId: dto.shipmentId,
      paymentType: dto.paymentType,
      amount: dto.amount,
      account: dto.account,
      notes: dto.notes ?? null,
    });
    return this.repo.save(existing);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Shipment payment not found');
    await this.repo.remove(existing);
  }
}
