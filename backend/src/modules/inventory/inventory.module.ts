import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './products/entities/product.entity';
import { ProductBatch } from './products/entities/product-batch.entity';
import { StockLevel } from './stock-movements/entities/stock-level.entity';
import { StockMovement } from './stock-movements/entities/stock-movement.entity';
import {
  StockAdjustment,
  StockAdjustmentLine,
} from './stock-movements/entities/stock-adjustment.entity';
import { StockAudit, StockAuditLine } from './stock-movements/entities/stock-audit.entity';
import { StockTransfer, StockTransferLine } from './stock-movements/entities/stock-transfer.entity';
import { PurchaseReceipt } from './stock-movements/entities/purchase-receipt.entity';
import { PurchaseInvoiceLine } from '../purchasing/entities/purchasing.entity';
import { SalesInvoiceLine } from '../sales/sales-invoices/entities/sales-invoice.entity';
import { Unit } from '../settings/entities/unit.entity';
import { PackageType } from '../settings/entities/package-type.entity';
import { ProductCategory } from '../settings/entities/product-category.entity';

import { ProductsController } from './products/products.controller';
import { ProductsService } from './products/products.service';
import { StockController } from './stock-movements/stock.controller';
import { StockService } from './stock-movements/stock.service';
import { StockAdjustmentsService } from './stock-movements/stock-adjustments.service';
import { StockAuditsController } from './stock-movements/stock-audits.controller';
import { StockAuditsService } from './stock-movements/stock-audits.service';
import { StockTransfersService } from './stock-movements/stock-transfers.service';
import { WarehouseViewController } from './stock-movements/warehouse-view.controller';
import { WarehouseViewService } from './stock-movements/warehouse-view.service';
import { PurchaseReceiptsController } from './stock-movements/purchase-receipts.controller';
import { PurchaseReceiptsService } from './stock-movements/purchase-receipts.service';
import { SettingsModule } from '../settings/settings.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductBatch,
      StockLevel,
      StockMovement,
      StockAdjustment,
      StockAdjustmentLine,
      StockAudit,
      StockAuditLine,
      StockTransfer,
      StockTransferLine,
      PurchaseReceipt,
      PurchaseInvoiceLine,
      SalesInvoiceLine,
      Unit,
      PackageType,
      ProductCategory,
    ]),
    SettingsModule,
    TreasuryModule,
  ],
  controllers: [
    ProductsController,
    StockController,
    StockAuditsController,
    WarehouseViewController,
    PurchaseReceiptsController,
  ],
  providers: [
    ProductsService,
    StockService,
    StockAdjustmentsService,
    StockAuditsService,
    StockTransfersService,
    WarehouseViewService,
    PurchaseReceiptsService,
  ],
  exports: [StockService, TypeOrmModule, PurchaseReceiptsService, StockAuditsService],
})
export class InventoryModule {}
