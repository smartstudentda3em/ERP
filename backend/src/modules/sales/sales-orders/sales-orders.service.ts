import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrder, SalesOrderLine } from './entities/sales-order.entity';
import { CreateSalesOrderDto } from './dto/sales-order.dto';
import { computeDocumentTotals, computeLine } from '../../../common/utils/pricing';
import { SalesDocumentStatus } from '../../../entities/enums';
import { NumberingSeriesService } from '../../settings/numbering-series.controller';

@Injectable()
export class SalesOrdersService {
  constructor(
    @InjectRepository(SalesOrder) private readonly repo: Repository<SalesOrder>,
    private readonly numberingSeriesService: NumberingSeriesService,
  ) {}

  findAll(companyId: string) {
    return this.repo.find({
      where: { companyId },
      relations: ['customer', 'warehouse'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<SalesOrder> {
    const order = await this.repo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.product', 'customer', 'warehouse'],
    });
    if (!order) throw new NotFoundException('Sales order not found');
    return order;
  }

  async create(dto: CreateSalesOrderDto, createdById: string, companyId: string): Promise<SalesOrder> {
    const totals = computeDocumentTotals(dto.lines);
    const documentNumber = await this.numberingSeriesService.getNextNumber(companyId, 'SALES_ORDER');

    const order = this.repo.create({
      documentNumber,
      orderDate: dto.orderDate,
      customerId: dto.customerId,
      warehouseId: dto.warehouseId,
      quotationId: dto.quotationId ?? null,
      companyId,
      branchId: dto.branchId ?? null,
      status: SalesDocumentStatus.CONFIRMED,
      notes: dto.notes ?? null,
      createdById,
      ...totals,
      lines: dto.lines.map((line) => {
        const computed = computeLine(line);
        return Object.assign(new SalesOrderLine(), {
          productId: line.productId,
          quantity: line.quantity,
          deliveredQuantity: 0,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent ?? 0,
          taxPercent: line.taxPercent ?? 0,
          lineTotal: computed.lineTotal,
        });
      }),
    });

    return this.repo.save(order);
  }
}
