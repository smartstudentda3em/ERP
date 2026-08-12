import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { NumberingSeries } from './entities/numbering-series.entity';
import { CreateNumberingSeriesDto, UpdateNumberingSeriesDto } from './dto/settings.dto';
import { NumberingResetPeriod } from '../../entities/enums';

/** Returns the reset-period key a date falls in ('2026' for yearly, '2026-07' for monthly, null when the series never resets). */
function periodKeyFor(resetPeriod: NumberingResetPeriod, date: Date): string | null {
  if (resetPeriod === NumberingResetPeriod.YEARLY) return String(date.getFullYear());
  if (resetPeriod === NumberingResetPeriod.MONTHLY) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  return null;
}

@Injectable()
export class NumberingSeriesService extends CompanyScopedCrudService<NumberingSeries> {
  constructor(@InjectRepository(NumberingSeries) repo: Repository<NumberingSeries>) {
    super(repo);
  }

  createForCompany(companyId: string, dto: Partial<NumberingSeries>): Promise<NumberingSeries> {
    const startNumber = dto.startNumber ?? 1;
    return super.createForCompany(companyId, { startNumber, nextNumber: startNumber, ...dto });
  }

  /**
   * Atomically reserves and returns the next formatted document number for a document type.
   * Throws if unconfigured. Pass `manager` when the caller already has an open transaction (e.g.
   * inserting the document row right after) so the reservation and the insert commit or roll back
   * together as one atomic unit instead of the reservation silently outliving a failed insert.
   */
  async getNextNumber(companyId: string, documentType: string, manager?: EntityManager): Promise<string> {
    const run = async (m: EntityManager) => {
      const seriesRepo = m.getRepository(NumberingSeries);
      const series = await seriesRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.companyId = :companyId AND s.documentType = :documentType', {
          companyId,
          documentType,
        })
        .getOne();

      if (!series) {
        throw new Error(`No numbering series configured for ${documentType}`);
      }

      return this.reserveNumber(series, seriesRepo);
    };
    return manager ? run(manager) : this.repo.manager.transaction(run);
  }

  /**
   * Same as getNextNumber(), but returns null instead of throwing when no series is configured —
   * for non-critical flows (product/party/warehouse codes) that should fall back to their old
   * ad-hoc numbering rather than fail outright until an admin configures a series for them.
   */
  async tryGetNextNumber(companyId: string, documentType: string, manager?: EntityManager): Promise<string | null> {
    const run = async (m: EntityManager) => {
      const seriesRepo = m.getRepository(NumberingSeries);
      const series = await seriesRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.companyId = :companyId AND s.documentType = :documentType', {
          companyId,
          documentType,
        })
        .getOne();

      if (!series) return null;
      return this.reserveNumber(series, seriesRepo);
    };
    return manager ? run(manager) : this.repo.manager.transaction(run);
  }

  private async reserveNumber(series: NumberingSeries, seriesRepo: Repository<NumberingSeries>): Promise<string> {
    const currentKey = periodKeyFor(series.resetPeriod, new Date());
    if (currentKey !== null && series.lastResetKey !== currentKey) {
      series.nextNumber = series.startNumber;
      series.lastResetKey = currentKey;
    }

    const current = series.nextNumber;
    series.nextNumber += 1;
    await seriesRepo.save(series);

    const padded = String(current).padStart(series.padLength, '0');
    return `${series.prefix}${padded}${series.suffix}`;
  }
}

@ApiTags('Settings - Numbering Series')
@Controller('settings/numbering-series')
export class NumberingSeriesController {
  constructor(private readonly service: NumberingSeriesService) {}

  @Get() @Permissions('settings.numbering-series.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Get(':id') @Permissions('settings.numbering-series.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.numbering-series.create') create(
    @Body() dto: CreateNumberingSeriesDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.numbering-series.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNumberingSeriesDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.numbering-series.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
