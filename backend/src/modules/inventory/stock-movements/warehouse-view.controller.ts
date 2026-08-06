import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { WarehouseViewService } from './warehouse-view.service';
import { WarehouseProductsQueryDto } from './dto/warehouse-view.dto';

@ApiTags('Inventory - Warehouse View')
@Controller('inventory/warehouse-view')
export class WarehouseViewController {
  constructor(private readonly service: WarehouseViewService) {}

  @Get(':warehouseId/summary')
  @Permissions('inventory.stock.view')
  summary(@Param('warehouseId', ParseUUIDPipe) warehouseId: string, @CurrentUser('companyId') companyId: string) {
    return this.service.getSummary(warehouseId, companyId);
  }

  @Get(':warehouseId/products')
  @Permissions('inventory.stock.view')
  products(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @CurrentUser('companyId') companyId: string,
    @Query() query: WarehouseProductsQueryDto,
  ) {
    return this.service.getProducts(warehouseId, companyId, query);
  }

  @Get('products/:productId/overview')
  @Permissions('inventory.stock.view')
  productOverview(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser('companyId') companyId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.getProductOverview(productId, companyId, warehouseId);
  }
}
