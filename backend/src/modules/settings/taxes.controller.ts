import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { Tax } from './entities/tax.entity';
import { CreateTaxDto, UpdateTaxDto } from './dto/settings.dto';

@Injectable()
export class TaxesService extends CompanyScopedCrudService<Tax> {
  constructor(@InjectRepository(Tax) repo: Repository<Tax>) {
    super(repo);
  }
}

@ApiTags('Settings - Taxes')
@Controller('settings/taxes')
export class TaxesController {
  constructor(private readonly service: TaxesService) {}

  @Get() @Permissions('settings.tax.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Get(':id') @Permissions('settings.tax.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.tax.create') create(
    @Body() dto: CreateTaxDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.tax.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.tax.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
