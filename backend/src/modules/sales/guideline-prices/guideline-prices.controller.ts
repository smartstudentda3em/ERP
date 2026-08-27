import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { GuidelinePricesService } from './guideline-prices.service';
import { AcCabolyPricesService } from './ac-caboly-prices.service';
import {
  CreateGuidelinePriceSheetDto,
  UpdateGuidelinePriceSheetDto,
  UpsertCabolyPriceDto,
} from './dto/guideline-price.dto';

@ApiTags('Sales - Guideline Prices')
@Controller('sales/guideline-prices')
export class GuidelinePricesController {
  constructor(private readonly service: GuidelinePricesService) {}

  @Get()
  @Permissions('sales.guidelinePrice.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  // Must stay ahead of the ':id' route below — otherwise Nest would try to parse
  // "supplier-products" itself as a sheet id.
  @Get('supplier-products')
  @Permissions('sales.guidelinePrice.view')
  findSupplierProducts(
    @Query('supplierId', ParseUUIDPipe) supplierId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.findSupplierProducts(supplierId, companyId);
  }

  @Get(':id')
  @Permissions('sales.guidelinePrice.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('sales.guidelinePrice.create')
  create(@Body() dto: CreateGuidelinePriceSheetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('sales.guidelinePrice.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGuidelinePriceSheetDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.update(id, dto, companyId);
  }

  @Delete(':id')
  @Permissions('sales.guidelinePrice.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}

@ApiTags('Sales - Guideline Prices')
@Controller('ac-caboly-prices')
export class AcCabolyPricesController {
  constructor(private readonly service: AcCabolyPricesService) {}

  @Get()
  @Permissions('sales.guidelinePrice.view')
  findAll(@CurrentUser('companyId') companyId: string, @Query('supplierId') supplierId?: string) {
    return this.service.findAll(companyId, supplierId);
  }

  @Post()
  @Permissions('sales.guidelinePrice.edit')
  upsert(@Body() dto: UpsertCabolyPriceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.upsert(dto, user.companyId!, user.userId);
  }
}
