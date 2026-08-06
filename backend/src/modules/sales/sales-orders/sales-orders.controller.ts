import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/sales-order.dto';

@ApiTags('Sales - Orders')
@Controller('sales/orders')
export class SalesOrdersController {
  constructor(private readonly service: SalesOrdersService) {}

  @Get()
  @Permissions('sales.order.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  @Get(':id')
  @Permissions('sales.order.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('sales.order.create')
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }
}
