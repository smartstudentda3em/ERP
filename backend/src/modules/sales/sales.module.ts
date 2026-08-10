import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quotation, QuotationLine } from './quotations/entities/quotation.entity';
import {
  SalesOrder,
  SalesOrderLine,
  DeliveryNote,
} from './sales-orders/entities/sales-order.entity';
import {
  SalesInvoice,
  SalesInvoiceLine,
  SalesReturn,
  SalesReturnLine,
} from './sales-invoices/entities/sales-invoice.entity';
import { SalesPayment } from './sales-payments/entities/sales-payment.entity';
import { User } from '../users/entities/user.entity';
import { UserCompany } from '../users/entities/user-company.entity';
import { SalesRepresentative } from '../parties/entities/sales-representative.entity';
import { CommissionException } from '../parties/entities/commission-exception.entity';

import { QuotationsController } from './quotations/quotations.controller';
import { QuotationsService } from './quotations/quotations.service';
import { SalesOrdersController } from './sales-orders/sales-orders.controller';
import { SalesOrdersService } from './sales-orders/sales-orders.service';
import { SalesInvoicesController } from './sales-invoices/sales-invoices.controller';
import { SalesInvoicesService } from './sales-invoices/sales-invoices.service';
import { SalesPaymentsController } from './sales-payments/sales-payments.controller';
import { SalesPaymentsService } from './sales-payments/sales-payments.service';

import { SettingsModule } from '../settings/settings.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesRepAccessModule } from '../../common/sales-rep-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quotation,
      QuotationLine,
      SalesOrder,
      SalesOrderLine,
      DeliveryNote,
      SalesInvoice,
      SalesInvoiceLine,
      SalesReturn,
      SalesReturnLine,
      SalesPayment,
      User,
      UserCompany,
      SalesRepresentative,
      CommissionException,
    ]),
    SettingsModule,
    TreasuryModule,
    InventoryModule,
    SalesRepAccessModule,
  ],
  controllers: [
    QuotationsController,
    SalesOrdersController,
    SalesInvoicesController,
    SalesPaymentsController,
  ],
  providers: [QuotationsService, SalesOrdersService, SalesInvoicesService, SalesPaymentsService],
  exports: [TypeOrmModule, QuotationsService, SalesInvoicesService, SalesPaymentsService],
})
export class SalesModule {}
