import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { Partner } from './entities/partner.entity';
import { CreatePartnerDto, UpdatePartnerDto } from './dto/settings.dto';

@Injectable()
export class PartnersService extends CompanyScopedCrudService<Partner> {
  constructor(@InjectRepository(Partner) repo: Repository<Partner>) {
    super(repo);
  }

  /** The combined share across every partner IN THE SAME COMPANY (excluding the one being edited) can never exceed 100% — each company has its own independent ownership cap table. */
  private async assertShareWithinLimit(companyId: string, sharePercentage: number, excludeId?: string): Promise<void> {
    const partners = await this.repo.find({ where: { companyId } });
    const currentTotal = partners
      .filter((p) => p.id !== excludeId)
      .reduce((sum, p) => sum + Number(p.sharePercentage), 0);
    const projectedTotal = currentTotal + Number(sharePercentage);
    if (projectedTotal > 100) {
      throw new BadRequestException(
        `Total partner share would be ${projectedTotal.toFixed(2)}%, which exceeds 100% (current total: ${currentTotal.toFixed(2)}%).`,
      );
    }
  }

  async createForCompany(companyId: string, dto: CreatePartnerDto): Promise<Partner> {
    await this.assertShareWithinLimit(companyId, dto.sharePercentage);
    return super.createForCompany(companyId, dto);
  }

  async updateForCompany(id: string, companyId: string, dto: UpdatePartnerDto): Promise<Partner> {
    if (dto.sharePercentage != null) {
      await this.assertShareWithinLimit(companyId, dto.sharePercentage, id);
    }
    return super.updateForCompany(id, companyId, dto);
  }
}

@ApiTags('Settings - Partners')
@Controller('settings/partners')
export class PartnersController {
  constructor(private readonly service: PartnersService) {}

  @Get() @Permissions('settings.partner.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
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
