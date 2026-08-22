import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateCatalogProductDto,
  UpdateCatalogProductDto,
} from './dto/product.dto';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@ApiTags('Inventory - Products')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  // Declared before the generic ':id' routes below so 'catalog' is never swallowed as an id param.
  @Get('catalog')
  @Permissions('inventory.product.view')
  findAllCatalog(@CurrentUser('companyId') companyId: string, @CurrentUser('userId') userId: string) {
    return this.service.findCatalogForCompany(companyId, userId);
  }

  @Post('catalog')
  @Permissions('inventory.product.create')
  createCatalogItem(@Body() dto: CreateCatalogProductDto, @CurrentUser('companyId') companyId: string) {
    return this.service.createCatalogItem(dto, companyId);
  }

  @Patch('catalog/:id')
  @Permissions('inventory.product.edit')
  updateCatalogItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogProductDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateCatalogItem(id, companyId, dto);
  }

  // Declared before the generic ':id' routes below, same reasoning as 'catalog' above.
  @Get('services')
  @Permissions('inventory.product.view')
  findAllServices(@CurrentUser('companyId') companyId: string) {
    return this.service.findServicesForCompany(companyId);
  }

  @Post('services')
  @Permissions('inventory.product.create')
  createService(@Body() dto: CreateServiceDto, @CurrentUser('companyId') companyId: string) {
    return this.service.createService(dto, companyId);
  }

  @Patch('services/:id')
  @Permissions('inventory.product.edit')
  updateService(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateService(id, companyId, dto);
  }

  @Delete('services/:id')
  @Permissions('inventory.product.delete')
  removeService(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.removeService(id, companyId);
  }

  @Get()
  @Permissions('inventory.product.view')
  findAll(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Query('search') search?: string,
  ) {
    return this.service.findAllForCompany(companyId, search, userId);
  }

  @Get('low-stock')
  @Permissions('inventory.product.view')
  lowStock(@CurrentUser('companyId') companyId: string) {
    return this.service.lowStockForCompany(companyId);
  }

  // Declared before ':id' for the same reason as 'catalog'/'low-stock' above. Same
  // inventory.product.view permission as everything else here — the "مندوب" role's restriction is
  // entirely about *what fields this returns* (see ProductsService.findRepViewForCompany), not a
  // separate permission code.
  @Get('rep-view')
  @Permissions('inventory.product.view')
  repView(@CurrentUser('companyId') companyId: string) {
    return this.service.findRepViewForCompany(companyId);
  }

  // Declared before ':id' for the same reason as 'catalog' above.
  @Get('sellable-raw-materials')
  @Permissions('inventory.product.view')
  findSellableRawMaterials(@CurrentUser('companyId') companyId: string, @CurrentUser('userId') userId: string) {
    return this.service.findSellableRawMaterialsForCompany(companyId, userId);
  }

  @Get('barcode/:barcode')
  @Permissions('inventory.product.view')
  findByBarcode(@Param('barcode') barcode: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findByBarcodeForCompany(barcode, companyId);
  }

  @Get(':id')
  @Permissions('inventory.product.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOneScoped(id, companyId);
  }

  @Post()
  @Permissions('inventory.product.create')
  create(@Body() dto: CreateProductDto, @CurrentUser('companyId') companyId: string) {
    return this.service.createForCompany(dto, companyId);
  }

  @Patch(':id')
  @Permissions('inventory.product.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateScoped(id, companyId, dto);
  }

  @Delete(':id')
  @Permissions('inventory.product.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.removeScoped(id, companyId);
  }
}
