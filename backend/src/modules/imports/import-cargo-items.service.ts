import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImportCargoItem } from './entities/import-cargo-item.entity';
import { Shipment } from './entities/shipment.entity';
import { CreateImportCargoItemDto, UpdateImportCargoItemDto } from './dto/import-cargo-item.dto';
import { ImportCargoStatus } from '../../entities/enums';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Product } from '../inventory/products/entities/product.entity';

@Injectable()
export class ImportCargoItemsService {
  constructor(
    @InjectRepository(ImportCargoItem) private readonly repo: Repository<ImportCargoItem>,
    @InjectRepository(Supplier) private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Shipment) private readonly shipmentRepo: Repository<Shipment>,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
  ) {}

  findAll(companyId: string) {
    return this.repo.find({
      where: { companyId },
      relations: ['product', 'supplier', 'shipment', 'currency', 'localCurrency'],
      order: { orderDate: 'DESC', createdAt: 'DESC' },
    });
  }

  /** The supplier's own currency is always the source of truth — never trusted from the client,
   * so a cargo line's currency can never drift from whatever the supplier's card actually says.
   * Also confirms the supplier belongs to the caller's company, same as product/shipment below. */
  private async getSupplierCurrencyId(supplierId: string, companyId: string): Promise<string | null> {
    const supplier = await this.supplierRepo.findOne({ where: { id: supplierId, companyId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier.currencyId;
  }

  /** Product and shipment must belong to the caller's company too — otherwise a client could
   * attach a cargo line to another company's product/shipment just by guessing its UUID. */
  private async assertRelatedEntitiesInCompany(productId: string, shipmentId: string, companyId: string) {
    const [product, shipment] = await Promise.all([
      this.productRepo.findOne({ where: { id: productId, companyId } }),
      this.shipmentRepo.findOne({ where: { id: shipmentId, companyId } }),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!shipment) throw new NotFoundException('Shipment not found');
  }

  async create(dto: CreateImportCargoItemDto, createdById: string, companyId: string): Promise<ImportCargoItem> {
    const currencyId = await this.getSupplierCurrencyId(dto.supplierId, companyId);
    await this.assertRelatedEntitiesInCompany(dto.productId, dto.shipmentId, companyId);
    const row = this.repo.create({
      productId: dto.productId,
      supplierId: dto.supplierId,
      shipmentId: dto.shipmentId,
      quantity: dto.quantity,
      unitPrice: dto.unitPrice,
      currencyId,
      conversionRate: dto.conversionRate ?? 1,
      localCurrencyId: dto.localCurrencyId ?? null,
      specifications: dto.specifications ?? null,
      // No longer collected from the add form — defaulted here instead.
      orderDate: dto.orderDate ?? new Date().toISOString().slice(0, 10),
      status: dto.status ?? ImportCargoStatus.ORDERED,
      notes: dto.notes ?? null,
      companyId,
      createdById,
    });
    return this.repo.save(row);
  }

  async update(id: string, companyId: string, dto: UpdateImportCargoItemDto): Promise<ImportCargoItem> {
    const row = await this.repo.findOne({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Import cargo item not found');
    const currencyId = await this.getSupplierCurrencyId(dto.supplierId, companyId);
    await this.assertRelatedEntitiesInCompany(dto.productId, dto.shipmentId, companyId);
    row.productId = dto.productId;
    row.supplierId = dto.supplierId;
    row.shipmentId = dto.shipmentId;
    row.quantity = dto.quantity;
    row.unitPrice = dto.unitPrice;
    row.currencyId = currencyId;
    row.conversionRate = dto.conversionRate ?? 1;
    row.localCurrencyId = dto.localCurrencyId ?? null;
    row.specifications = dto.specifications ?? null;
    // orderDate/status/notes are no longer collected from the edit form — omitted means "leave
    // whatever value is already on the row untouched" rather than resetting/clearing it.
    if (dto.orderDate !== undefined) row.orderDate = dto.orderDate;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.notes !== undefined) row.notes = dto.notes;
    return this.repo.save(row);
  }

  async remove(id: string, companyId: string): Promise<void> {
    const row = await this.repo.findOne({ where: { id, companyId } });
    if (!row) throw new NotFoundException('Import cargo item not found');
    await this.repo.remove(row);
  }
}
