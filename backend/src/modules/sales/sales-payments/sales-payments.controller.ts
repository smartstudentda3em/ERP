import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { SalesPaymentsService } from './sales-payments.service';
import { CreateSalesPaymentDto, UpdateSalesPaymentDto } from './dto/sales-payment.dto';

@ApiTags('Sales - Payments')
@Controller('sales/payments')
export class SalesPaymentsController {
  constructor(private readonly service: SalesPaymentsService) {}

  @Get()
  @Permissions('sales.payment.view')
  findAll(@CurrentUser('companyId') companyId: string, @Query('customerId') customerId?: string) {
    return this.service.findAll(companyId, customerId);
  }

  @Post()
  @Permissions('sales.payment.create')
  create(@Body() dto: CreateSalesPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('sales.payment.edit')
  update(@Param('id') id: string, @Body() dto: UpdateSalesPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.userId, user.companyId!);
  }

  @Delete(':id')
  @Permissions('sales.payment.delete')
  remove(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}
