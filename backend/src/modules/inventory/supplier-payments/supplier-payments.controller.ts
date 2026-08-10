import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { SupplierPaymentsService } from './supplier-payments.service';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto/supplier-payment.dto';

@ApiTags('Suppliers - Payments')
@Controller('supplier-payments')
export class SupplierPaymentsController {
  constructor(private readonly service: SupplierPaymentsService) {}

  @Get()
  @Permissions('suppliers.payment.view')
  findAll(@CurrentUser('companyId') companyId: string, @Query('supplierId') supplierId?: string) {
    return this.service.findAll(companyId, supplierId);
  }

  @Post()
  @Permissions('suppliers.payment.create')
  create(@Body() dto: CreateSupplierPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Patch(':id')
  @Permissions('suppliers.payment.edit')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.update(id, dto, user.userId, user.companyId!);
  }

  @Delete(':id')
  @Permissions('suppliers.payment.delete')
  remove(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}
