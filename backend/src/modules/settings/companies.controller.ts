import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { BaseCrudService } from '../../common/services/base-crud.service';
import { Company } from './entities/company.entity';
import { CreateCompanyDto, UpdateCompanyDto } from './dto/settings.dto';

@Injectable()
export class CompaniesService extends BaseCrudService<Company> {
  constructor(@InjectRepository(Company) repo: Repository<Company>) {
    super(repo);
  }
}

@ApiTags('Settings - Companies')
@Controller('settings/companies')
export class CompaniesController {
  constructor(private readonly service: CompaniesService) {}

  @Get() @Permissions('settings.company.view') findAll() {
    return this.service.findAll();
  }
  @Get(':id') @Permissions('settings.company.view') findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
  @Post() @Permissions('settings.company.create') create(@Body() dto: CreateCompanyDto) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('settings.company.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('settings.company.delete') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
