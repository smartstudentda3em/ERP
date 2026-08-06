import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { SalesPaymentsService } from './sales-payments.service';
import { CreateSalesPaymentDto } from './dto/sales-payment.dto';

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
}
