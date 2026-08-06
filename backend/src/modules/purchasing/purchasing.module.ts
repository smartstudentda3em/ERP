import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PurchaseRequest,
  PurchaseRequestLine,
  PurchaseOrder,
  PurchaseOrderLine,
  GoodsReceipt,
  PurchaseInvoice,
  PurchaseInvoiceLine,
  PurchasePayment,
  SupplierReturn,
} from './entities/purchasing.entity';
import {
  PurchaseRequestsController,
  PurchaseRequestsService,
  PurchaseOrdersController,
  PurchaseOrdersService,
  PurchaseInvoicesController,
  PurchaseInvoicesService,
  PurchasePaymentsController,
  PurchasePaymentsService,
} from './purchasing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseRequest,
      PurchaseRequestLine,
      PurchaseOrder,
      PurchaseOrderLine,
      GoodsReceipt,
      PurchaseInvoice,
      PurchaseInvoiceLine,
      PurchasePayment,
      SupplierReturn,
    ]),
  ],
  controllers: [
    PurchaseRequestsController,
    PurchaseOrdersController,
    PurchaseInvoicesController,
    PurchasePaymentsController,
  ],
  providers: [
    PurchaseRequestsService,
    PurchaseOrdersService,
    PurchaseInvoicesService,
    PurchasePaymentsService,
  ],
  exports: [TypeOrmModule],
})
export class PurchasingModule {}
