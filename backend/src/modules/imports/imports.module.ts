import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportCargoItem } from './entities/import-cargo-item.entity';
import { Shipment } from './entities/shipment.entity';
import { ShipmentExpense } from './entities/shipment-expense.entity';
import { ShipmentPayment } from './entities/shipment-payment.entity';
import { ShippingExpenseType } from './entities/shipping-expense-type.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Product } from '../inventory/products/entities/product.entity';
import { ImportCargoItemsService } from './import-cargo-items.service';
import { ImportCargoItemsController } from './import-cargo-items.controller';
import { ShipmentsService } from './shipments.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentPaymentsService } from './shipment-payments.service';
import { ShipmentPaymentsController } from './shipment-payments.controller';
import { ShippingExpenseTypesService, ShippingExpenseTypesController } from './shipping-expense-types.controller';
import { SettingsModule } from '../settings/settings.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImportCargoItem,
      Shipment,
      ShipmentExpense,
      ShipmentPayment,
      ShippingExpenseType,
      Supplier,
      Product,
    ]),
    SettingsModule,
    TreasuryModule,
  ],
  controllers: [
    ImportCargoItemsController,
    ShipmentsController,
    ShipmentPaymentsController,
    ShippingExpenseTypesController,
  ],
  providers: [ImportCargoItemsService, ShipmentsService, ShipmentPaymentsService, ShippingExpenseTypesService],
})
export class ImportsModule {}
