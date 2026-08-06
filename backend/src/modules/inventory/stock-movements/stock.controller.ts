import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { StockService } from './stock.service';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockAdjustmentDto, CreateStockTransferDto, UpdateStockLocationDto } from './dto/stock.dto';

@ApiTags('Inventory - Stock')
@Controller('inventory/stock')
export class StockController {
  constructor(
    private readonly stockService: StockService,
    private readonly adjustmentsService: StockAdjustmentsService,
    private readonly transfersService: StockTransfersService,
  ) {}

  @Get('levels')
  @Permissions('inventory.stock.view')
  levels(
    @CurrentUser('companyId') companyId: string,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stockService.getStockLevels(companyId, productId, warehouseId);
  }

  @Get('movements')
  @Permissions('inventory.stock.view')
  movements(
    @CurrentUser('companyId') companyId: string,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stockService.getMovements(companyId, productId, warehouseId);
  }

  @Patch('levels/:id/location')
  @Permissions('inventory.stock.edit')
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStockLocationDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.stockService.updateLocation(id, companyId, dto.location);
  }

  @Get('adjustments')
  @Permissions('inventory.stock.view')
  listAdjustments(@CurrentUser('companyId') companyId: string) {
    return this.adjustmentsService.findAll(companyId);
  }

  @Get('adjustments/:id')
  @Permissions('inventory.stock.view')
  getAdjustment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.adjustmentsService.findOne(id, companyId);
  }

  @Post('adjustments')
  @Permissions('inventory.stock.edit')
  createAdjustment(@Body() dto: CreateStockAdjustmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.adjustmentsService.create(dto, user.userId, user.companyId!);
  }

  @Get('transfers')
  @Permissions('inventory.stock.view')
  listTransfers(@CurrentUser('companyId') companyId: string) {
    return this.transfersService.findAll(companyId);
  }

  @Post('transfers')
  @Permissions('inventory.stock.edit')
  createTransfer(@Body() dto: CreateStockTransferDto, @CurrentUser() user: AuthenticatedUser) {
    return this.transfersService.create(dto, user.userId, user.companyId!);
  }
}
