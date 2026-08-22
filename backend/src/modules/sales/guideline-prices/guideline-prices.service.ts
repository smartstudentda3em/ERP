import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
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
      relations: ['lines', 'lines.product', 'supplier'],
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  async findOne(id: string, companyId: string): Promise<GuidelinePriceSheet> {
    const sheet = await this.repo.findOne({
      where: { id, companyId },
      relations: ['lines', 'lines.product', 'supplier'],
    });
    if (!sheet) throw new NotFoundException('Guideline price sheet not found');
    return sheet;
  }

  /** One sheet per company row, all in one transaction — either every row in the submitted batch
   * is created, or none are (a duplicate/invalid row anywhere in the batch rolls the whole save
   * back rather than leaving a partial set of sheets for that month). */
  async create(
    dto: CreateGuidelinePriceSheetDto,
    createdById: string,
    companyId: string,
  ): Promise<GuidelinePriceSheet[]> {
    const supplierIds = dto.companies.map((c) => c.supplierId);
    if (new Set(supplierIds).size !== supplierIds.length) {
      throw new BadRequestException('The same company was selected more than once');
    }

    const existing = await this.repo.find({
      where: { companyId, month: dto.month, year: dto.year, supplierId: In(supplierIds) },
      relations: ['supplier'],
    });
    if (existing.length) {
      throw new BadRequestException(
        `A guideline price sheet already exists for this month for: ${existing.map((s) => s.supplier.companyName).join(', ')}`,
      );
    }

    const sheets = dto.companies.map((c) =>
      this.repo.create({
        companyId,
        month: dto.month,
        year: dto.year,
        supplierId: c.supplierId,
        isAuthorizedAgent: c.isAuthorizedAgent,
        discountPercentage: c.discountPercentage,
        createdById,
        lines: [] as GuidelinePriceLine[],
      }),
    );
    return this.repo.save(sheets);
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
