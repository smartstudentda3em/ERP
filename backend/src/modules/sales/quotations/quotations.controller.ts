import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto, UpdateQuotationDto } from './dto/quotation.dto';

@ApiTags('Sales - Quotations')
@Controller('sales/quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Get()
  @Permissions('sales.quotation.view')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.service.findAll(user.companyId!, user.userId);
  }

  @Get(':id')
  @Permissions('sales.quotation.view')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.findOne(id, companyId);
  }

  @Post()
  @Permissions('sales.quotation.create')
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.userId, user.companyId!);
  }

  @Post(':id/confirm')
  @Permissions('sales.quotation.approve')
  confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.confirm(id, companyId);
  }

  @Patch(':id')
  @Permissions('sales.quotation.edit')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuotationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.update(id, dto, user.companyId!, user.isSystemRole);
  }

  @Delete(':id')
  @Permissions('sales.quotation.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.remove(id, user.companyId!, user.isSystemRole);
  }

  @Post(':id/convert-to-invoice')
  @Permissions('sales.quotation.approve')
  convertToInvoice(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.convertToInvoice(id, user.companyId!, user.userId);
  }
}
