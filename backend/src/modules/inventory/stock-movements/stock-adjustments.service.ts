import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  StockAdjustment,
  StockAdjustmentLine,
} from './entities/stock-adjustment.entity';
import { StockService } from './stock.service';
import { StockMovementType, DocumentStatus } from '../../../entities/enums';
import { CreateStockAdjustmentDto } from './dto/stock.dto';
import { Warehouse } from '../../settings/entities/warehouse.entity';
import { Product } from '../products/entities/product.entity';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';

@Injectable()
export class StockAdjustmentsService {
  constructor(
    @InjectRepository(StockAdjustment) private readonly repo: Repository<StockAdjustment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stockService: StockService,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {}

  findAll(companyId: string) {
    return this.repo.find({ where: { companyId }, relations: ['lines', 'warehouse'], order: { createdAt: 'DESC' } });
  }

  findOne(id: string, companyId: string) {
    return this.repo.findOne({ where: { id, companyId }, relations: ['lines', 'lines.product', 'warehouse'] });
  }

  /**
   * Confirms the adjustment: for each line, issues or receives the quantity delta at the given
   * cost. Accepts an optional `manager` so a caller that needs this composed atomically with its
   * own other writes (e.g. StockAuditsService reversing-then-reapplying stock across an edit) can
   * share its outer transaction instead of this opening a second, independently-committed one —
   * without that, a failure partway through the caller's own follow-up write would leave this
   * adjustment's stock effect applied with no way to roll it back. Opens its own transaction only
   * when called standalone (no manager given).
   */
  async create(
    dto: CreateStockAdjustmentDto,
    createdById: string,
    companyId: string,
    manager?: EntityManager,
  ): Promise<StockAdjustment> {
    const run = async (manager: EntityManager) => {
      // The warehouse must belong to the caller's company — otherwise a client could adjust stock
      // in another company's warehouse just by guessing its UUID.
      const warehouse = await manager
        .getRepository(Warehouse)
        .findOne({ where: { id: dto.warehouseId, companyId } });
      if (!warehouse) throw new NotFoundException('Warehouse not found');

      // A kit product (see Product.isKit) has no StockLevel row of its own — "how many kits are
      // physically on the shelf" isn't a countable fact, only its real components are. Rejected
      // here rather than exploded, unlike sales/purchases/transfers.
      const products = await manager
        .getRepository(Product)
        .find({ where: { id: In(dto.lines.map((l) => l.productId)), companyId } });
      const kitProduct = products.find((p) => p.isKit);
      if (kitProduct) {
        throw new BadRequestException(
          `Cannot adjust stock of kit product "${kitProduct.nameAr || kitProduct.nameEn}" directly — adjust its components individually`,
        );
      }

      const documentNumber =
        (await this.numberingSeriesService.tryGetNextNumber(companyId, 'STOCK_ADJUSTMENT')) ??
        `ADJ-${Date.now()}`;

      for (const line of dto.lines) {
        const delta = line.countedQuantity - line.systemQuantity;
        if (delta > 0) {
          await this.stockService.receive(
            {
              companyId,
              productId: line.productId,
              warehouseId: dto.warehouseId,
              quantity: delta,
              unitCost: line.unitCost,
              referenceType: 'STOCK_ADJUSTMENT',
              referenceNumber: documentNumber,
              createdById,
            },
            StockMovementType.ADJUSTMENT_IN,
            manager,
          );
        } else if (delta < 0) {
          await this.stockService.issue(
            {
              companyId,
              productId: line.productId,
              warehouseId: dto.warehouseId,
              quantity: Math.abs(delta),
              referenceType: 'STOCK_ADJUSTMENT',
              referenceNumber: documentNumber,
              createdById,
            },
            StockMovementType.ADJUSTMENT_OUT,
            manager,
          );
        }
      }

      const adjustment = manager.getRepository(StockAdjustment).create({
        companyId,
        documentNumber,
        adjustmentDate: dto.adjustmentDate,
        warehouseId: dto.warehouseId,
        reason: dto.reason ?? null,
        status: DocumentStatus.CONFIRMED,
        createdById,
        lines: dto.lines.map((l) =>
          manager.getRepository(StockAdjustmentLine).create({
            productId: l.productId,
            systemQuantity: l.systemQuantity,
            countedQuantity: l.countedQuantity,
            unitCost: l.unitCost,
          }),
        ),
      });

      return manager.getRepository(StockAdjustment).save(adjustment);
    };
    return manager ? run(manager) : this.dataSource.transaction(run);
  }
}
