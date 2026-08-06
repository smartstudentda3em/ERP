import { Body, Controller, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { FiscalYear } from './entities/fiscal-year.entity';
import { CreateFiscalYearDto } from './dto/settings.dto';

@Injectable()
export class FiscalYearsService extends CompanyScopedCrudService<FiscalYear> {
  constructor(@InjectRepository(FiscalYear) repo: Repository<FiscalYear>) {
    super(repo);
  }

  close(id: string, companyId: string) {
    return this.updateForCompany(id, companyId, { isClosed: true } as any);
  }
}

@ApiTags('Settings - Fiscal Years')
@Controller('settings/fiscal-years')
export class FiscalYearsController {
  constructor(private readonly service: FiscalYearsService) {}

  @Get() @Permissions('settings.fiscal-year.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Get(':id') @Permissions('settings.fiscal-year.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.fiscal-year.create') create(
    @Body() dto: CreateFiscalYearDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id/close') @Permissions('settings.fiscal-year.approve') close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.close(id, companyId);
  }
}
