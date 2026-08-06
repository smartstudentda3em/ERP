import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { StockLevel } from './entities/stock-level.entity';
import { StockMovement } from './entities/stock-movement.entity';
import { Product } from '../products/entities/product.entity';
import { StockMovementType } from '../../../entities/enums';

export interface StockMovementInput {
  companyId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  createdById: string;
}

export interface ReceiveStockInput extends StockMovementInput {
  unitCost: number;
}

export interface IssueResult {
  unitCost: number;
  totalCost: number;
}

/**
 * Central inventory valuation engine (weighted-average costing). Every module that moves
 * stock (sales invoices, purchase receipts, adjustments, transfers) goes through this
 * service so `stock_levels.averageCost` and the stock_movements ledger stay authoritative.
 */
@Injectable()
export class StockService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private async getOrCreateLevel(
    manager: EntityManager,
    companyId: string,
    productId: string,
    warehouseId: string,
  ): Promise<StockLevel> {
    const repo = manager.getRepository(StockLevel);
    let level = await repo
      .createQueryBuilder('sl')
      .setLock('pessimistic_write')
      .where('sl."productId" = :productId AND sl."warehouseId" = :warehouseId', {
        productId,
        warehouseId,
      })
      .getOne();

    if (!level) {
      level = repo.create({ companyId, productId, warehouseId, quantityOnHand: 0, averageCost: 0 });
      level = await repo.save(level);
    }
    return level;
  }

  async receive(
    input: ReceiveStockInput,
    movementType: StockMovementType = StockMovementType.PURCHASE_RECEIPT,
    manager?: EntityManager,
  ): Promise<IssueResult> {
    const run = async (m: EntityManager): Promise<IssueResult> => {
      const level = await this.getOrCreateLevel(m, input.companyId, input.productId, input.warehouseId);

      const currentQty = Number(level.quantityOnHand);
      const currentCost = Number(level.averageCost);
      const incomingQty = Number(input.quantity);
      const incomingCost = Number(input.unitCost);

      const newQty = currentQty + incomingQty;
      const newAverageCost =
        newQty === 0 ? 0 : (currentQty * currentCost + incomingQty * incomingCost) / newQty;

      level.quantityOnHand = newQty;
      level.averageCost = newAverageCost;
      await m.getRepository(StockLevel).save(level);

      await m.getRepository(Product).update(input.productId, { averageCost: newAverageCost });

      await m.getRepository(StockMovement).save(
        m.getRepository(StockMovement).create({
          companyId: input.companyId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          type: movementType,
          quantity: incomingQty,
          unitCost: incomingCost,
          totalCost: incomingQty * incomingCost,
          balanceQuantityAfter: newQty,
          balanceAverageCostAfter: newAverageCost,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
          createdById: input.createdById,
        }),
      );

      return { unitCost: incomingCost, totalCost: incomingQty * incomingCost };
    };

    if (manager) return run(manager);
    return this.dataSource.transaction(run);
  }

  async issue(
    input: StockMovementInput,
    movementType: StockMovementType = StockMovementType.SALES_ISSUE,
    manager?: EntityManager,
  ): Promise<IssueResult> {
    const run = async (m: EntityManager): Promise<IssueResult> => {
      const level = await this.getOrCreateLevel(m, input.companyId, input.productId, input.warehouseId);

      const currentQty = Number(level.quantityOnHand);
      const currentCost = Number(level.averageCost);
      const outgoingQty = Number(input.quantity);

      if (currentQty < outgoingQty) {
        throw new BadRequestException(
          `Insufficient stock for product ${input.productId} in warehouse ${input.warehouseId}: ` +
            `available ${currentQty}, requested ${outgoingQty}`,
        );
      }

      const newQty = currentQty - outgoingQty;
      level.quantityOnHand = newQty;
      await m.getRepository(StockLevel).save(level);

      const totalCost = outgoingQty * currentCost;

      await m.getRepository(StockMovement).save(
        m.getRepository(StockMovement).create({
          companyId: input.companyId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          type: movementType,
          quantity: outgoingQty,
          unitCost: currentCost,
          totalCost,
          balanceQuantityAfter: newQty,
          balanceAverageCostAfter: currentCost,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          referenceNumber: input.referenceNumber ?? null,
          notes: input.notes ?? null,
          createdById: input.createdById,
        }),
      );

      return { unitCost: currentCost, totalCost };
    };

    if (manager) return run(manager);
    return this.dataSource.transaction(run);
  }

  async getStockLevels(companyId: string, productId?: string, warehouseId?: string) {
    const repo = this.dataSource.getRepository(StockLevel);
    return repo.find({
      where: {
        companyId,
        ...(productId ? { productId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      relations: ['product', 'product.unit', 'product.packageType', 'warehouse'],
    });
  }

  /** Scoped to the caller's company — a stock-level id belonging to another company 404s exactly like an id that doesn't exist at all. */
  async updateLocation(id: string, companyId: string, location: string): Promise<StockLevel> {
    const repo = this.dataSource.getRepository(StockLevel);
    const existing = await repo.findOne({ where: { id, companyId } });
    if (!existing) throw new NotFoundException('Stock level not found');
    await repo.update(id, { location });
    return repo.findOneOrFail({ where: { id }, relations: ['product', 'warehouse'] });
  }

  async getMovements(companyId: string, productId?: string, warehouseId?: string) {
    const repo = this.dataSource.getRepository(StockMovement);
    return repo.find({
      where: {
        companyId,
        ...(productId ? { productId } : {}),
        ...(warehouseId ? { warehouseId } : {}),
      },
      order: { createdAt: 'DESC' },
      relations: ['product', 'warehouse'],
      take: 500,
    });
  }
}
