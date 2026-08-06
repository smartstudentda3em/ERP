import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

@ApiTags('Customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Get()
  @Permissions('customers.view')
  findAll(@CurrentUser('companyId') companyId: string) {
    return this.service.findAllForCompany(companyId);
  }

  @Get('outstanding-total')
  @Permissions('customers.view')
  outstandingTotal(@CurrentUser('companyId') companyId: string, @Query('asOfDate') asOfDate: string) {
    return this.service.getOutstandingTotal(companyId, asOfDate);
  }

  @Get(':id')
  @Permissions('customers.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOneScoped(id, companyId);
  }

  @Get(':id/statement')
  @Permissions('customers.view')
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getStatement(id, companyId, dateFrom, dateTo);
  }

  @Get(':id/outstanding-invoices')
  @Permissions('customers.view')
  outstandingInvoices(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.getOutstandingInvoices(id, companyId);
  }

  @Get(':id/invoices')
  @Permissions('customers.view')
  allInvoices(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.getAllInvoices(id, companyId);
  }

  @Post()
  @Permissions('customers.create')
  create(@Body() dto: CreateCustomerDto, @CurrentUser('companyId') companyId: string) {
    return this.service.createForCompany(dto, companyId);
  }

  @Patch(':id')
  @Permissions('customers.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.updateScoped(id, companyId, dto);
  }

  @Delete(':id')
  @Permissions('customers.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.removeScoped(id, companyId);
  }
}
