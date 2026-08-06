import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { ProductCategory } from './entities/product-category.entity';
import { Brand } from './entities/brand.entity';
import { Unit } from './entities/unit.entity';
import {
  CreateCatalogItemDto,
  UpdateCatalogItemDto,
  CreateBrandDto,
  UpdateBrandDto,
  CreateUnitDto,
  UpdateUnitDto,
} from './dto/settings.dto';

@Injectable()
export class ProductCategoriesService extends CompanyScopedCrudService<ProductCategory> {
  constructor(@InjectRepository(ProductCategory) repo: Repository<ProductCategory>) {
    super(repo);
  }
}

@Injectable()
export class BrandsService extends CompanyScopedCrudService<Brand> {
  constructor(@InjectRepository(Brand) repo: Repository<Brand>) {
    super(repo);
  }
}

@Injectable()
export class UnitsService extends CompanyScopedCrudService<Unit> {
  constructor(@InjectRepository(Unit) repo: Repository<Unit>) {
    super(repo);
  }
}

@ApiTags('Settings - Product Categories')
@Controller('settings/product-categories')
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get() @Permissions('settings.product-category.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Post() @Permissions('settings.product-category.create') create(
    @Body() dto: CreateCatalogItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.product-category.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.product-category.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}

@ApiTags('Settings - Brands')
@Controller('settings/brands')
export class BrandsController {
  constructor(private readonly service: BrandsService) {}

  @Get() @Permissions('settings.brand.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Post() @Permissions('settings.brand.create') create(
    @Body() dto: CreateBrandDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.brand.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.brand.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}

@ApiTags('Settings - Units')
@Controller('settings/units')
export class UnitsController {
  constructor(private readonly service: UnitsService) {}

  @Get() @Permissions('settings.unit.view') findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }
  @Post() @Permissions('settings.unit.create') create(
    @Body() dto: CreateUnitDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.createForCompany(companyId, dto);
  }
  @Patch(':id') @Permissions('settings.unit.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateForCompany(id, companyId, dto);
  }
  @Delete(':id') @Permissions('settings.unit.delete') remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeForCompany(id, companyId);
  }
}
