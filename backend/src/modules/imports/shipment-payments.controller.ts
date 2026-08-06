import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ShipmentPaymentsService } from './shipment-payments.service';
import { CreateShipmentPaymentDto, UpdateShipmentPaymentDto } from './dto/shipment-payment.dto';

@ApiTags('Imports - Shipment Payments')
@Controller('imports/shipment-payments')
export class ShipmentPaymentsController {
  constructor(private readonly service: ShipmentPaymentsService) {}

  @Get()
  @Permissions('imports.shipmentPayment.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAll(companyId);
  }

  @Get(':id')
  @Permissions('imports.shipmentPayment.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('imports.shipmentPayment.create')
  create(@Body() dto: CreateShipmentPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('imports.shipmentPayment.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShipmentPaymentDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.update(id, dto, companyId);
  }

  @Delete(':id')
  @Permissions('imports.shipmentPayment.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}
