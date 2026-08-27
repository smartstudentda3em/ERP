import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcCabolyPrice } from './entities/guideline-price.entity';
import { UpsertCabolyPriceDto } from './dto/guideline-price.dto';

/**
 * Air Conditioning only — "سعر الكابولي" column on the Guideline Price detail page
 * (GuidelinePriceDetailPage.tsx). One price per (supplier, القدرة/capacity) pair, shared across
 * every product row on that page with the same capacity from the same supplier — see
 * AcCabolyPrice's own entity doc comment for why this isn't a per-product-line field.
 */
@Injectable()
export class AcCabolyPricesService {
  constructor(@InjectRepository(AcCabolyPrice) private readonly repo: Repository<AcCabolyPrice>) {}

  findAll(companyId: string, supplierId?: string): Promise<AcCabolyPrice[]> {
    return this.repo.find({ where: { companyId, ...(supplierId ? { supplierId } : {}) } });
  }

  /** Creates the (companyId, supplierId, capacity) row on first save, otherwise updates its price
   * in place — every product row sharing that pair picks up the new value on their next refetch. */
  async upsert(dto: UpsertCabolyPriceDto, companyId: string, createdById: string): Promise<AcCabolyPrice> {
    const capacity = dto.capacity.trim();
    const existing = await this.repo.findOne({ where: { companyId, supplierId: dto.supplierId, capacity } });
    if (existing) {
      existing.price = dto.price;
      return this.repo.save(existing);
    }
    return this.repo.save(
      this.repo.create({ companyId, supplierId: dto.supplierId, capacity, price: dto.price, createdById }),
    );
  }
}
