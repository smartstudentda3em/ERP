import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { StockTransfer, StockTransferLine } from './entities/stock-transfer.entity';
import { ProductKitsService } from '../products/product-kits.service';
import { StockMovementType, DocumentStatus } from '../../../entities/enums';
import { CreateStockTransferDto } from './dto/stock.dto';
import { Warehouse } from '../../settings/entities/warehouse.entity';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';

@Injectable()
export class StockTransfersService {
  constructor(
    @InjectRepository(StockTransfer) private readonly repo: Repository<StockTransfer>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly productKitsService: ProductKitsService,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {}

  /** Resolves each transfer's `createdById` to the user's display name — a plain audit column, not a relation, so this is a raw lookup rather than an ORM join. */
  async findAll(companyId: string) {
    const transfers = await this.repo.find({
      where: { companyId },
      relations: ['lines', 'lines.product', 'fromWarehouse', 'toWarehouse'],
      order: { createdAt: 'DESC' },
    });
    const userRows = await this.dataSource
      .createQueryBuilder()
      .select('u.id', 'id')
      .addSelect('u."fullName"', 'fullName')
      .from('users', 'u')
      .getRawMany();
    const nameById = new Map<string, string>(userRows.map((u) => [u.id, u.fullName]));
    return transfers.map((tr) => ({ ...tr, createdByName: nameById.get(tr.createdById) ?? '—' }));
  }

  async create(dto: CreateStockTransferDto, createdById: string, companyId: string): Promise<StockTransfer> {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouse must be different');
    }
    return this.dataSource.transaction(async (manager) => {
      // Both warehouses must belong to the caller's company — otherwise a client could transfer
      // stock into/out of another company's warehouse just by guessing its UUID.
      const [fromWarehouse, toWarehouse] = await Promise.all([
        manager.getRepository(Warehouse).findOne({ where: { id: dto.fromWarehouseId, companyId } }),
        manager.getRepository(Warehouse).findOne({ where: { id: dto.toWarehouseId, companyId } }),
      ]);
      if (!fromWarehouse || !toWarehouse) throw new NotFoundException('Warehouse not found');
      const documentNumber =
        (await this.numberingSeriesService.tryGetNextNumber(companyId, 'STOCK_TRANSFER')) ?? `TRF-${Date.now()}`;

      for (const line of dto.lines) {
        const { unitCost } = await this.productKitsService.issueSmart(
          {
            companyId,
            productId: line.productId,
            warehouseId: dto.fromWarehouseId,
            quantity: line.quantity,
            referenceType: 'STOCK_TRANSFER',
            referenceNumber: documentNumber,
            createdById,
          },
          StockMovementType.TRANSFER_OUT,
          manager,
        );

        await this.productKitsService.receiveSmart(
          {
            companyId,
            productId: line.productId,
            warehouseId: dto.toWarehouseId,
            quantity: line.quantity,
            unitCost,
            referenceType: 'STOCK_TRANSFER',
            referenceNumber: documentNumber,
            createdById,
          },
          StockMovementType.TRANSFER_IN,
          manager,
        );
      }

      const transfer = manager.getRepository(StockTransfer).create({
        companyId,
        documentNumber,
        transferDate: dto.transferDate,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        status: DocumentStatus.CONFIRMED,
        notes: dto.notes ?? null,
        createdById,
        lines: dto.lines.map((l) =>
          manager.getRepository(StockTransferLine).create({
            productId: l.productId,
            quantity: l.quantity,
          }),
        ),
      });

      return manager.getRepository(StockTransfer).save(transfer);
    });
  }
}
