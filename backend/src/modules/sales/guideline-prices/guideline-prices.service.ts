import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GuidelinePriceSheet, GuidelinePriceLine } from './entities/guideline-price.entity';
import { CreateGuidelinePriceSheetDto, UpdateGuidelinePriceSheetDto } from './dto/guideline-price.dto';

@Injectable()
export class GuidelinePricesService {
  constructor(
    @InjectRepository(GuidelinePriceSheet) private readonly repo: Repository<GuidelinePriceSheet>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Lines (with their product) are eager-loaded here — unlike Quotations' list, the Guideline
   * Prices table renders one column per product directly off the list response (see
   * GuidelinePricesTab.tsx), so there's no separate per-row detail fetch. */
  async findAll(companyId: string): Promise<GuidelinePriceSheet[]> {
    return this.repo.find({
      where: { companyId },
      relations: ['lines', 'lines.product'],
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<GuidelinePriceSheet> {
    const sheet = await this.repo.findOne({ where: { id, companyId }, relations: ['lines', 'lines.product'] });
    if (!sheet) throw new NotFoundException('Guideline price sheet not found');
    return sheet;
  }

  async create(dto: CreateGuidelinePriceSheetDto, createdById: string, companyId: string): Promise<GuidelinePriceSheet> {
    const existing = await this.repo.findOne({
      where: { companyId, month: dto.month, year: dto.year },
    });
    if (existing) {
      throw new BadRequestException('A guideline price sheet already exists for this month');
    }

    const sheet = this.repo.create({
      companyId,
      month: dto.month,
      year: dto.year,
      createdById,
      lines: dto.lines.map((line) =>
        Object.assign(new GuidelinePriceLine(), { productId: line.productId, price: line.price }),
      ),
    });
    return this.repo.save(sheet);
  }

  async update(id: string, dto: UpdateGuidelinePriceSheetDto, companyId: string): Promise<GuidelinePriceSheet> {
    return this.dataSource.transaction(async (manager) => {
      const sheetRepo = manager.getRepository(GuidelinePriceSheet);
      const lineRepo = manager.getRepository(GuidelinePriceLine);
      const sheet = await sheetRepo.findOne({ where: { id, companyId } });
      if (!sheet) throw new NotFoundException('Guideline price sheet not found');

      if (dto.lines) {
        // Delete-then-recreate — same convention as Quotation's update() since the incoming set of
        // products can freely add/remove/reorder lines with no stable identity to diff against.
        await lineRepo.delete({ sheetId: id });
        sheet.lines = dto.lines.map((line) =>
          lineRepo.create({ sheetId: id, productId: line.productId, price: line.price }),
        );
      }
      return sheetRepo.save(sheet);
    });
  }

  async remove(id: string, companyId: string): Promise<void> {
    const sheet = await this.findOne(id, companyId);
    await this.repo.remove(sheet);
  }
}
