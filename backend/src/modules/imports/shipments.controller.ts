import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto, UpdateShipmentDto } from './dto/shipment.dto';
import { CreateShipmentExpenseDto, UpdateShipmentExpenseDto } from './dto/shipment-expense.dto';

@ApiTags('Imports - Shipments')
@Controller('imports/shipments')
export class ShipmentsController {
  constructor(private readonly service: ShipmentsService) {}

  @Get()
  @Permissions('imports.shipment.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  @Get(':id')
  @Permissions('imports.shipment.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('imports.shipment.create')
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('imports.shipment.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.update(id, companyId, dto);
  }

  @Delete(':id')
  @Permissions('imports.shipment.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }

  @Post(':id/expenses')
  @Permissions('imports.shipment.edit')
  addExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateShipmentExpenseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.addExpense(id, user.companyId!, dto, user.userId);
  }

  @Patch(':id/expenses/:expenseId')
  @Permissions('imports.shipment.edit')
  updateExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @Body() dto: UpdateShipmentExpenseDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateExpense(id, expenseId, companyId, dto);
  }

  @Delete(':id/expenses/:expenseId')
  @Permissions('imports.shipment.edit')
  removeExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('expenseId', ParseUUIDPipe) expenseId: string,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.removeExpense(id, expenseId, companyId);
  }
}
