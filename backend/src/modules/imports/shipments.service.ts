import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shipment } from './entities/shipment.entity';
import { ShipmentExpense } from './entities/shipment-expense.entity';
import { ShippingExpenseType } from './entities/shipping-expense-type.entity';
import { CreateShipmentDto, UpdateShipmentDto } from './dto/shipment.dto';
import { CreateShipmentExpenseDto, UpdateShipmentExpenseDto } from './dto/shipment-expense.dto';

@Injectable()
export class ShipmentsService {
  constructor(
    @InjectRepository(Shipment) private readonly repo: Repository<Shipment>,
    @InjectRepository(ShipmentExpense) private readonly expenseRepo: Repository<ShipmentExpense>,
    @InjectRepository(ShippingExpenseType) private readonly expenseTypeRepo: Repository<ShippingExpenseType>,
  ) {}

  /**
   * A shipment's total cost is never a separately-entered figure — it's always the live sum of
   * its expense lines, so it can never drift out of sync the way a cached running total could.
   */
  async findAll(companyId: string) {
    const shipments = await this.repo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
    if (shipments.length === 0) return [];

    const totals = await this.expenseRepo
      .createQueryBuilder('e')
      .select('e."shipmentId"', 'shipmentId')
      .addSelect('COALESCE(SUM(e.amount), 0)', 'total')
      .where('e."shipmentId" IN (:...ids)', { ids: shipments.map((s) => s.id) })
      .groupBy('e."shipmentId"')
      .getRawMany();
    const totalByShipmentId = new Map(totals.map((t) => [t.shipmentId, Number(t.total)]));

    return shipments.map((s) => ({ ...s, totalCost: totalByShipmentId.get(s.id) ?? 0 }));
  }

  /** Scoped to the caller's company — an id that belongs to another company 404s exactly like an id that doesn't exist at all. */
  async findOne(id: string, companyId: string) {
    const shipment = await this.repo.findOne({ where: { id, companyId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    const expenses = await this.expenseRepo.find({
      where: { shipmentId: id },
      relations: ['shippingExpenseType'],
      order: { createdAt: 'DESC' },
    });
    const totalCost = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
    return { ...shipment, expenses, totalCost };
  }

  async create(dto: CreateShipmentDto, createdById: string, companyId: string): Promise<Shipment> {
    const row = this.repo.create({
      shipmentName: dto.shipmentName,
      shipmentDate: dto.shipmentDate ?? null,
      shippingCompanyName: dto.shippingCompanyName,
      companyId,
      createdById,
    });
    return this.repo.save(row);
  }

  async update(id: string, companyId: string, dto: UpdateShipmentDto): Promise<Shipment> {
    const row = await this.repo.findOne({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Shipment not found');
    row.shipmentName = dto.shipmentName;
    row.shipmentDate = dto.shipmentDate ?? null;
    row.shippingCompanyName = dto.shippingCompanyName;
    return this.repo.save(row);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Shipment not found');
    await this.repo.remove(row);
  }

  /**
   * `ShipmentExpense` has no `companyId` column of its own — it's scoped indirectly through its
   * parent shipment, so every expense operation below re-checks the shipment against the caller's
   * company first (same 404-on-cross-company-id behavior as everywhere else).
   */
  async addExpense(
    shipmentId: string,
    companyId: string,
    dto: CreateShipmentExpenseDto,
    createdById: string,
  ): Promise<ShipmentExpense> {
    const shipment = await this.repo.findOne({ where: { id: shipmentId, companyId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    const expenseType = await this.expenseTypeRepo.findOne({
      where: { id: dto.shippingExpenseTypeId, companyId },
    });
    if (!expenseType) throw new NotFoundException('Shipping expense type not found');
    const row = this.expenseRepo.create({
      shipmentId,
      shippingExpenseTypeId: dto.shippingExpenseTypeId,
      amount: dto.amount,
      description: dto.description ?? null,
      createdById,
    });
    const saved = await this.expenseRepo.save(row);
    return this.expenseRepo.findOne({ where: { id: saved.id }, relations: ['shippingExpenseType'] }) as Promise<ShipmentExpense>;
  }

  async updateExpense(
    shipmentId: string,
    expenseId: string,
    companyId: string,
    dto: UpdateShipmentExpenseDto,
  ): Promise<ShipmentExpense> {
    const shipment = await this.repo.findOne({ where: { id: shipmentId, companyId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    const expenseType = await this.expenseTypeRepo.findOne({
      where: { id: dto.shippingExpenseTypeId, companyId },
    });
    if (!expenseType) throw new NotFoundException('Shipping expense type not found');
    const row = await this.expenseRepo.findOne({ where: { id: expenseId, shipmentId } });
    if (!row) throw new NotFoundException('Shipment expense not found');
    row.shippingExpenseTypeId = dto.shippingExpenseTypeId;
    row.amount = dto.amount;
    row.description = dto.description ?? null;
    await this.expenseRepo.save(row);
    return this.expenseRepo.findOne({ where: { id: row.id }, relations: ['shippingExpenseType'] }) as Promise<ShipmentExpense>;
  }

  async removeExpense(shipmentId: string, expenseId: string, companyId: string): Promise<void> {
    const shipment = await this.repo.findOne({ where: { id: shipmentId, companyId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    const row = await this.expenseRepo.findOne({ where: { id: expenseId, shipmentId } });
    if (!row) throw new NotFoundException('Shipment expense not found');
    await this.expenseRepo.remove(row);
  }
}
