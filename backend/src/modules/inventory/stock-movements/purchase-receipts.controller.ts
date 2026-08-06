import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { PurchaseReceiptsService } from './purchase-receipts.service';
import { CreatePurchaseReceiptDto, UpdatePurchaseReceiptDto } from './dto/stock.dto';

@ApiTags('Inventory - Purchase Receipts')
@Controller('inventory/purchase-receipts')
export class PurchaseReceiptsController {
  constructor(private readonly service: PurchaseReceiptsService) {}

  @Get()
  @Permissions('inventory.purchaseReceipt.view')
  findAll(
    @CurrentUser('companyId') companyId: string,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.findAll(companyId, productId, warehouseId);
  }

  @Get(':id')
  @Permissions('inventory.purchaseReceipt.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('inventory.purchaseReceipt.create')
  create(@Body() dto: CreatePurchaseReceiptDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('inventory.purchaseReceipt.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.userId, user.companyId!);
  }

  @Delete(':id')
  @Permissions('inventory.purchaseReceipt.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.companyId!, user.userId);
  }
}
