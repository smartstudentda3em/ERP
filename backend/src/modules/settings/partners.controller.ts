import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { Partner } from './entities/partner.entity';
import { Company } from './entities/company.entity';
import { CashMovement } from '../treasury/entities/cash-movement.entity';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/settings.dto';

/** Mirrors frontend/src/lib/use-active-company.ts's PRINTING_PRESS_COMPANY_CODE. */
const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

@Injectable()
export class PartnersService extends CompanyScopedCrudService<Partner> {
  constructor(
    @InjectRepository(Partner) repo: Repository<Partner>,
    @InjectRepository(Company) private readonly companiesRepo: Repository<Company>,
    @InjectRepository(CashMovement) private readonly cashMovementsRepo: Repository<CashMovement>,
  ) {
    super(repo);
  }

  /** System-wide delete-protection rule: a partner with any real capital-injection/dividend
   * history (CashMovement.partnerId) can never be deleted — that FK is `onDelete: "SET NULL"`
   * (a partner isn't itself a financial document, so hard-blocking every edit elsewhere via
   * RESTRICT wasn't right), which means the DB alone would silently strip that history out of the
   * partner's own balance/dividend reports instead of refusing. This is the explicit
   * application-level check that fills that gap. */
  async removeForCompany(id: string, companyId: string): Promise<void> {
    const hasHistory = await this.cashMovementsRepo.exist({ where: { partnerId: id, companyId } });
    if (hasHistory) {
      throw new BadRequestException(
        'لا يمكن حذف هذا الشريك — لديه حركات مالية (مساهمات أو أرباح) مسجلة في النظام. يجب حذف هذه الحركات أولاً.',
      );
    }
    return super.removeForCompany(id, companyId);
  }

  /**
   * The combined share across every partner in the same cap-table scope (excluding the one being
   * edited) can never exceed 100%. For every company but Printing Press, that scope is the whole
   * company. For Printing Press, `branchId` splits the cap table per branch — each branch has its
   * own independent 100% (partners with no branchId, i.e. every non-Press company, are grouped
   * together via the `null` bucket, same as before this column existed).
   */
  private async assertShareWithinLimit(
    companyId: string,
    sharePercentage: number,
    branchId?: string | null,
    excludeId?: string,
  ): Promise<void> {
    const partners = await this.repo.find({ where: { companyId } });
    const currentTotal = partners
      .filter((p) => p.id !== excludeId && (p.branchId ?? null) === (branchId ?? null))
      .reduce((sum, p) => sum + Number(p.sharePercentage), 0);
    const projectedTotal = currentTotal + Number(sharePercentage);
    if (projectedTotal > 100) {
      throw new BadRequestException(
        `Total partner share would be ${projectedTotal.toFixed(2)}%, which exceeds 100% (current total: ${currentTotal.toFixed(2)}%).`,
      );
    }
  }

  findAllForBranch(companyId: string, branchId?: string): Promise<Partner[]> {
    if (!branchId) return this.findAllForCompany(companyId);
    return this.repo.find({ where: { companyId, branchId } as any, order: { createdAt: 'ASC' } as any });
  }

  /**
   * Printing Press's whole dividend/cap-table model is split per branch (see Partner.branchId's
   * own doc comment) — a Press partner left without one is not "company-wide", it's an orphaned
   * record with no pool to belong to. Left unenforced, that orphan silently borrowed the entire
   * company's profit in getPartnersDividendsBreakdown()'s old branchId-defaults-to-undefined
   * fallback, and — once a proper branch-scoped row for the same person existed alongside it —
   * had that person's share counted twice when the frontend merged both rows by name (a real
   * partner's dividend share showing as exactly double what it should be). Every other company
   * has no branches at all, so branchId staying null there is the normal, only valid state.
   */
  private async assertBranchRequiredForPress(companyId: string, branchId: string | null | undefined): Promise<void> {
    const company = await this.companiesRepo.findOne({ where: { id: companyId } });
    if (company?.code === PRINTING_PRESS_COMPANY_CODE && !branchId) {
      throw new BadRequestException('A branch must be selected for this partner.');
    }
  }

  async createForCompany(companyId: string, dto: CreatePartnerDto): Promise<Partner> {
    await this.assertBranchRequiredForPress(companyId, dto.branchId ?? null);
    await this.assertShareWithinLimit(companyId, dto.sharePercentage, dto.branchId ?? null);
    return super.createForCompany(companyId, { ...dto, branchId: dto.branchId ?? null } as any);
  }

  async updateForCompany(id: string, companyId: string, dto: UpdatePartnerDto): Promise<Partner> {
    if (dto.branchId !== undefined) {
      await this.assertBranchRequiredForPress(companyId, dto.branchId ?? null);
    }
    if (dto.sharePercentage != null) {
      const existing = await this.findOneForCompany(id, companyId);
      const branchId = dto.branchId !== undefined ? dto.branchId ?? null : existing.branchId;
      await this.assertShareWithinLimit(companyId, dto.sharePercentage, branchId, id);
    }
    return super.updateForCompany(id, companyId, dto);
  }
}

@ApiTags('Settings - Partners')
@Controller('settings/partners')
export class PartnersController {
  constructor(private readonly service: PartnersService) {}

  @Get() @Permissions('settings.partner.view') findAll(
    @CurrentUser('companyId') companyId: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.findAllForBranch(companyId, branchId);
  }
  @Post() @Permissions('settings.partner.create') create(
    @Body() dto: CreatePartnerDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.partner.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartnerDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.partner.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
