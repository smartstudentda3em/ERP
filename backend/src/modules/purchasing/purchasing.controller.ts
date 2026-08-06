import { Body, Controller, Delete, Get, Injectable, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { BaseCrudService } from '../../common/services/base-crud.service';
import {
  PurchaseRequest,
  PurchaseOrder,
  PurchaseInvoice,
  PurchasePayment,
} from './entities/purchasing.entity';

/**
 * Purchasing is scaffolded in this pass: schema is complete (see docs/DATABASE.md) and these
 * controllers give basic CRUD so the UI has something to call, but there is no approval
 * workflow, goods-receipt-to-stock wiring, or GL posting yet — see docs/ROADMAP.md.
 */

@Injectable()
export class PurchaseRequestsService extends BaseCrudService<PurchaseRequest> {
  constructor(@InjectRepository(PurchaseRequest) repo: Repository<PurchaseRequest>) {
    super(repo);
  }
}

@Injectable()
export class PurchaseOrdersService extends BaseCrudService<PurchaseOrder> {
  constructor(@InjectRepository(PurchaseOrder) repo: Repository<PurchaseOrder>) {
    super(repo);
  }
}

@Injectable()
export class PurchaseInvoicesService extends BaseCrudService<PurchaseInvoice> {
  constructor(@InjectRepository(PurchaseInvoice) repo: Repository<PurchaseInvoice>) {
    super(repo);
  }
}

@Injectable()
export class PurchasePaymentsService extends BaseCrudService<PurchasePayment> {
  constructor(@InjectRepository(PurchasePayment) repo: Repository<PurchasePayment>) {
    super(repo);
  }
}

@ApiTags('Purchasing - Requests (scaffold)')
@Controller('purchasing/requests')
export class PurchaseRequestsController {
  constructor(private readonly service: PurchaseRequestsService) {}
  @Get() @Permissions('purchasing.request.view') findAll() {
    return this.service.findAll();
  }
  @Post() @Permissions('purchasing.request.create') create(@Body() dto: Partial<PurchaseRequest>) {
    return this.service.create(dto);
  }
}

@ApiTags('Purchasing - Orders (scaffold)')
@Controller('purchasing/orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}
  @Get() @Permissions('purchasing.order.view') findAll() {
    return this.service.findAll();
  }
  @Get(':id') @Permissions('purchasing.order.view') findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
  @Post() @Permissions('purchasing.order.create') create(@Body() dto: Partial<PurchaseOrder>) {
    return this.service.create(dto);
  }
  @Patch(':id') @Permissions('purchasing.order.edit') update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<PurchaseOrder>,
  ) {
    return this.service.update(id, dto);
  }
  @Delete(':id') @Permissions('purchasing.order.delete') remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}

@ApiTags('Purchasing - Invoices (scaffold)')
@Controller('purchasing/invoices')
export class PurchaseInvoicesController {
  constructor(private readonly service: PurchaseInvoicesService) {}
  @Get() @Permissions('purchasing.invoice.view') findAll() {
    return this.service.findAll();
  }
  @Get(':id') @Permissions('purchasing.invoice.view') findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }
  @Post() @Permissions('purchasing.invoice.create') create(@Body() dto: Partial<PurchaseInvoice>) {
    return this.service.create(dto);
  }
}

@ApiTags('Purchasing - Payments (scaffold)')
@Controller('purchasing/payments')
export class PurchasePaymentsController {
  constructor(private readonly service: PurchasePaymentsService) {}
  @Get() @Permissions('purchasing.payment.view') findAll() {
    return this.service.findAll();
  }
  @Post() @Permissions('purchasing.payment.create') create(@Body() dto: Partial<PurchasePayment>) {
    return this.service.create(dto);
  }
}
