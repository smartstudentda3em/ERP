import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AcSupplierPaymentsService } from './ac-supplier-payments.service';
import { AcSupplierTaxPaymentsService } from './ac-supplier-tax-payments.service';
import { AcSupplierBonusesService } from './ac-supplier-bonuses.service';
import { CreateAcSupplierPaymentDto, CreateAcSupplierTaxPaymentDto, CreateAcSupplierBonusDto } from './dto/ac-supplier-ledger.dto';

@ApiTags('AC Supplier Ledger')
@Controller('ac-supplier-payments')
export class AcSupplierPaymentsController {
  constructor(private readonly service: AcSupplierPaymentsService) {}

  @Get()
  @Permissions('suppliers.payment.view')
  findAll(@CurrentUser('companyId') companyId: string, @Query('supplierId') supplierId?: string) {
    return this.service.findAll(companyId, supplierId);
  }

  @Post()
  @Permissions('suppliers.payment.create')
  create(@Body() dto: CreateAcSupplierPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.companyId!, user.userId);
  }

  @Delete(':id')
  @Permissions('suppliers.payment.delete')
  remove(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}

@ApiTags('AC Supplier Ledger')
@Controller('ac-supplier-bonuses')
export class AcSupplierBonusesController {
  constructor(private readonly service: AcSupplierBonusesService) {}

  @Get()
  @Permissions('suppliers.payment.view')
  findAll(@CurrentUser('companyId') companyId: string, @Query('supplierId') supplierId?: string) {
    return this.service.findAll(companyId, supplierId);
  }

  @Post()
  @Permissions('suppliers.payment.create')
  create(@Body() dto: CreateAcSupplierBonusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.companyId!, user.userId);
  }

  @Delete(':id')
  @Permissions('suppliers.payment.delete')
  remove(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}

@ApiTags('AC Supplier Ledger')
@Controller('ac-supplier-tax-payments')
export class AcSupplierTaxPaymentsController {
  constructor(private readonly service: AcSupplierTaxPaymentsService) {}

  @Get()
  @Permissions('suppliers.payment.view')
  findAll(@CurrentUser('companyId') companyId: string, @Query('supplierId') supplierId?: string) {
    return this.service.findAll(companyId, supplierId);
  }

  @Post()
  @Permissions('suppliers.payment.create')
  create(@Body() dto: CreateAcSupplierTaxPaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(dto, user.companyId!, user.userId);
  }

  @Delete(':id')
  @Permissions('suppliers.payment.delete')
  remove(@Param('id') id: string, @CurrentUser('companyId') companyId: string) {
    return this.service.remove(id, companyId);
  }
}
