import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from './entities/company.entity';
import { Branch } from './entities/branch.entity';
import { Warehouse } from './entities/warehouse.entity';
import { Currency } from './entities/currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { Tax } from './entities/tax.entity';
import { FiscalYear } from './entities/fiscal-year.entity';
import { NumberingSeries } from './entities/numbering-series.entity';
import { ProductCategory } from './entities/product-category.entity';
import { Brand } from './entities/brand.entity';
import { Unit } from './entities/unit.entity';
import { PackageType } from './entities/package-type.entity';
import { ExpenseCategory } from './entities/expense-category.entity';
import { Partner } from './entities/partner.entity';
import { CashMovement } from '../treasury/entities/cash-movement.entity';
import { Product } from '../inventory/products/entities/product.entity';
import { Customer } from '../parties/customers/entities/customer.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { SalesInvoice } from '../sales/sales-invoices/entities/sales-invoice.entity';
import { PurchaseReceipt } from '../inventory/stock-movements/entities/purchase-receipt.entity';
import { Quotation } from '../sales/quotations/entities/quotation.entity';
import { InstallmentPlan } from '../sales/installment-plans/entities/installment-plan.entity';

import { CompaniesController, CompaniesService } from './companies.controller';
import { BranchesController, BranchesService } from './branches.controller';
import { WarehousesController, WarehousesService } from './warehouses.controller';
import { PackageTypesController, PackageTypesService } from './package-types.controller';
import { ExpenseCategoriesController, ExpenseCategoriesService } from './expense-categories.controller';
import { PartnersController, PartnersService } from './partners.controller';
import { CurrenciesController, CurrenciesService } from './currencies.controller';
import { TaxesController, TaxesService } from './taxes.controller';
import { FiscalYearsController, FiscalYearsService } from './fiscal-years.controller';
import { NumberingSeriesController, NumberingSeriesService } from './numbering-series.controller';
import {
  ProductCategoriesController,
  ProductCategoriesService,
  BrandsController,
  BrandsService,
  UnitsController,
  UnitsService,
} from './catalog.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Branch,
      Warehouse,
      Currency,
      ExchangeRate,
      Tax,
      FiscalYear,
      NumberingSeries,
      ProductCategory,
      Brand,
      Unit,
      PackageType,
      ExpenseCategory,
      Partner,
      CashMovement,
      Product,
      Customer,
      Supplier,
      SalesInvoice,
      PurchaseReceipt,
      Quotation,
      InstallmentPlan,
    ]),
  ],
  controllers: [
    CompaniesController,
    BranchesController,
    WarehousesController,
    CurrenciesController,
    TaxesController,
    FiscalYearsController,
    NumberingSeriesController,
    ProductCategoriesController,
    BrandsController,
    UnitsController,
    PackageTypesController,
    ExpenseCategoriesController,
    PartnersController,
  ],
  providers: [
    CompaniesService,
    BranchesService,
    WarehousesService,
    CurrenciesService,
    TaxesService,
    FiscalYearsService,
    NumberingSeriesService,
    ProductCategoriesService,
    BrandsService,
    UnitsService,
    PackageTypesService,
    ExpenseCategoriesService,
    PartnersService,
  ],
  exports: [NumberingSeriesService, TypeOrmModule],
})
export class SettingsModule {}
