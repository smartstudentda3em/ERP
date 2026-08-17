import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { Product } from './entities/product.entity';
import { ProductComponent } from './entities/product-component.entity';
import { StockLevel } from '../stock-movements/entities/stock-level.entity';
import {
  IssueResult,
  ReceiveStockInput,
  StockMovementInput,
  StockService,
} from '../stock-movements/stock.service';
import { StockMovementType } from '../../../entities/enums';

/**
 * Kit-aware wrapper around StockService.issue/receive — AC company only. A "kit" product
 * (Product.isKit) never holds its own StockLevel row; issuing/receiving it explodes into
 * the same call against its ProductComponent list instead, so every existing caller of
 * StockService.issue/receive can swap to this service with no other change and keep working
 * identically for every non-kit product.
 */
@Injectable()
export class ProductKitsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockService: StockService,
  ) {}

  private async loadKitComponents(m: EntityManager, product: Product): Promise<ProductComponent[]> {
    const components = await m.getRepository(ProductComponent).find({
      where: { parentProductId: product.id },
      relations: ['componentProduct'],
    });
    if (components.length === 0) {
      throw new BadRequestException(
        `Kit product "${product.nameAr || product.nameEn}" has no components configured`,
      );
    }
    return components;
  }

  async issueSmart(
    input: StockMovementInput,
    movementType: StockMovementType = StockMovementType.SALES_ISSUE,
    manager?: EntityManager,
  ): Promise<IssueResult> {
    const run = async (m: EntityManager): Promise<IssueResult> => {
      const product = await m
        .getRepository(Product)
        .findOne({ where: { id: input.productId, companyId: input.companyId } });
      if (!product) throw new NotFoundException('Product not found');
      if (!product.isKit) return this.stockService.issue(input, movementType, m);

      const components = await this.loadKitComponents(m, product);
      const requestedQty = Number(input.quantity);

      // Pre-check every component before touching any stock, so a short component gives a
      // clear, specific error instead of a mid-loop rollback with no context on which part is short.
      for (const c of components) {
        const required = requestedQty * Number(c.quantity);
        const level = await m
          .getRepository(StockLevel)
          .findOne({ where: { productId: c.componentProductId, warehouseId: input.warehouseId } });
        const available = Number(level?.quantityOnHand ?? 0);
        if (available < required) {
          throw new BadRequestException(
            `Insufficient stock of component "${c.componentProduct.nameAr || c.componentProduct.nameEn}" ` +
              `(available ${available}, required ${required})`,
          );
        }
      }

      let totalCost = 0;
      for (const c of components) {
        const result = await this.stockService.issue(
          { ...input, productId: c.componentProductId, quantity: requestedQty * Number(c.quantity) },
          movementType,
          m,
        );
        totalCost += result.totalCost;
      }
      return { unitCost: requestedQty > 0 ? totalCost / requestedQty : 0, totalCost };
    };

    if (manager) return run(manager);
    return this.dataSource.transaction(run);
  }

  async receiveSmart(
    input: ReceiveStockInput,
    movementType: StockMovementType = StockMovementType.PURCHASE_RECEIPT,
    manager?: EntityManager,
  ): Promise<IssueResult> {
    const run = async (m: EntityManager): Promise<IssueResult> => {
      const product = await m
        .getRepository(Product)
        .findOne({ where: { id: input.productId, companyId: input.companyId } });
      if (!product) throw new NotFoundException('Product not found');
      if (!product.isKit) return this.stockService.receive(input, movementType, m);

      const components = await this.loadKitComponents(m, product);
      const requestedQty = Number(input.quantity);
      const totalCostToDistribute = requestedQty * Number(input.unitCost);

      // Split the kit's total received cost across components proportionally by each
      // component's own known cost, so the money received always reconciles to what was
      // actually paid regardless of how the split lands per unit.
      const weights = components.map(
        (c) => Number(c.componentProduct.purchasePrice) || Number(c.componentProduct.averageCost) || 0,
      );
      const totalWeight = weights.reduce((sum, w) => sum + w, 0);

      let totalCost = 0;
      for (let i = 0; i < components.length; i++) {
        const c = components[i];
        const componentQty = requestedQty * Number(c.quantity);
        const share = totalWeight > 0 ? weights[i] / totalWeight : 1 / components.length;
        const componentTotalCost = totalCostToDistribute * share;
        const componentUnitCost = componentQty > 0 ? componentTotalCost / componentQty : 0;
        const result = await this.stockService.receive(
          {
            ...input,
            productId: c.componentProductId,
            quantity: componentQty,
            unitCost: componentUnitCost,
          },
          movementType,
          m,
        );
        totalCost += result.totalCost;
      }
      return { unitCost: Number(input.unitCost), totalCost };
    };

    if (manager) return run(manager);
    return this.dataSource.transaction(run);
  }

  /** Read-only helper for callers (e.g. sales-invoices' below-cost check) that need a kit's
   * components without issuing/receiving anything. */
  async getComponents(parentProductId: string, manager?: EntityManager): Promise<ProductComponent[]> {
    const repo = (manager ?? this.dataSource).getRepository(ProductComponent);
    return repo.find({ where: { parentProductId }, relations: ['componentProduct'] });
  }

  /** Deletes and re-inserts the full component set for a kit — mirrors this codebase's established
   * "reverse-then-reapply rather than compute a delta" convention (see purchase-receipts.service.ts's
   * edit handling) instead of diffing the submitted array against the existing rows. Must run inside
   * the caller's own transaction. */
  async replaceComponents(
    companyId: string,
    parentProductId: string,
    components: { componentProductId: string; quantity: number }[],
    manager: EntityManager,
  ): Promise<void> {
    const repo = manager.getRepository(ProductComponent);
    await repo.delete({ parentProductId });
    if (components.length === 0) return;
    const rows = components.map((c) =>
      repo.create({
        companyId,
        parentProductId,
        componentProductId: c.componentProductId,
        quantity: c.quantity,
      }),
    );
    await repo.save(rows);
  }
}
