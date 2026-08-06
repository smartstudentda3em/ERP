import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { Currency } from './entities/currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { CreateCurrencyDto, CreateExchangeRateDto, UpdateCurrencyDto } from './dto/settings.dto';

@Injectable()
export class CurrenciesService extends CompanyScopedCrudService<Currency> {
  constructor(
    @InjectRepository(Currency) repo: Repository<Currency>,
    @InjectRepository(ExchangeRate) private readonly rateRepo: Repository<ExchangeRate>,
  ) {
    super(repo);
  }

  listRates(companyId: string, currencyId?: string) {
    return this.rateRepo.find({
      where: currencyId ? { companyId, currencyId } : { companyId },
      order: { effectiveDate: 'DESC' },
      relations: ['currency'],
    });
  }

  addRate(companyId: string, dto: CreateExchangeRateDto) {
    const rate = this.rateRepo.create({ ...dto, companyId });
    return this.rateRepo.save(rate);
  }
}

@ApiTags('Settings - Currencies')
@Controller('settings/currencies')
export class CurrenciesController {
  constructor(private readonly service: CurrenciesService) {}

  @Get() @Permissions('settings.currency.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Get('exchange-rates') @Permissions('settings.currency.view') listRates(@CurrentUser('companyId') companyId: string) {
    return this.service.listRates(companyId);
  }
  @Get(':id') @Permissions('settings.currency.view') findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findOneForCompany(id, companyId);
  }
  @Post() @Permissions('settings.currency.create') create(
    @Body() dto: CreateCurrencyDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Post('exchange-rates') @Permissions('settings.currency.create') addRate(
    @Body() dto: CreateExchangeRateDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.addRate(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.currency.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCurrencyDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.currency.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
