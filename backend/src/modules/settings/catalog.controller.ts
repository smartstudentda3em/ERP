import { BadRequestException, Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CompanyScopedCrudService } from '../../common/services/base-crud.service';
import { ProductCategory } from './entities/product-category.entity';
import { Brand } from './entities/brand.entity';
import { Unit } from './entities/unit.entity';
import { Product } from '../inventory/products/entities/product.entity';
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
  constructor(
    @InjectRepository(ProductCategory) repo: Repository<ProductCategory>,
    @InjectRepository(Product) private readonly productsRepo: Repository<Product>,
  ) {
    super(repo);
  }

  /** System-wide delete-protection rule: Unit/Brand/PackageType all cascade-delete from their
   * category (their own onDelete: "CASCADE"), which would otherwise let a category with real
   * products still classified under it vanish along with everything built on it, silently
   * re-categorizing those products to none (Product.categoryId is "SET NULL", not RESTRICT — a
   * product's category is informational, not something the DB alone should refuse to touch). This
   * explicit check is what actually stops that. */
  async removeForCompany(id: string, companyId: string): Promise<void> {
    const inUse = await this.productsRepo.exist({ where: { categoryId: id, companyId } });
    if (inUse) {
      throw new BadRequestException(
        'لا يمكن حذف هذه الفئة — توجد أصناف مسجلة تحتها في النظام. يجب نقل أو حذف هذه الأصناف أولاً.',
      );
    }
    return super.removeForCompany(id, companyId);
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
