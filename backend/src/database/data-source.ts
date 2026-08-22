import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

// Settings
import { Company } from '../modules/settings/entities/company.entity';
import { Branch } from '../modules/settings/entities/branch.entity';
import { Warehouse } from '../modules/settings/entities/warehouse.entity';
import { Currency } from '../modules/settings/entities/currency.entity';
import { ExchangeRate } from '../modules/settings/entities/exchange-rate.entity';
import { Tax } from '../modules/settings/entities/tax.entity';
import { FiscalYear } from '../modules/settings/entities/fiscal-year.entity';
import { NumberingSeries } from '../modules/settings/entities/numbering-series.entity';
import { ProductCategory } from '../modules/settings/entities/product-category.entity';
import { Brand } from '../modules/settings/entities/brand.entity';
import { Unit } from '../modules/settings/entities/unit.entity';
import { PackageType } from '../modules/settings/entities/package-type.entity';
import { ExpenseCategory } from '../modules/settings/entities/expense-category.entity';
import { Partner } from '../modules/settings/entities/partner.entity';

// Users / RBAC
import { User } from '../modules/users/entities/user.entity';
import { Role } from '../modules/users/entities/role.entity';
import { Permission } from '../modules/users/entities/permission.entity';
import { Session } from '../modules/users/entities/session.entity';
import { UserCompany } from '../modules/users/entities/user-company.entity';

// Audit
import { AuditLog } from '../modules/audit-log/entities/audit-log.entity';

// Parties
import { Customer } from '../modules/parties/customers/entities/customer.entity';
import { Supplier } from '../modules/parties/suppliers/entities/supplier.entity';
import { SupplierPayment } from '../modules/parties/suppliers/entities/supplier-payment.entity';
import { SalesRepresentative } from '../modules/parties/entities/sales-representative.entity';
import { CommissionException } from '../modules/parties/entities/commission-exception.entity';

// Inventory
import { Product } from '../modules/inventory/products/entities/product.entity';
import { ProductBatch } from '../modules/inventory/products/entities/product-batch.entity';
import { StockLevel } from '../modules/inventory/stock-movements/entities/stock-level.entity';
import { StockMovement } from '../modules/inventory/stock-movements/entities/stock-movement.entity';
import {
  StockAdjustment,
  StockAdjustmentLine,
} from '../modules/inventory/stock-movements/entities/stock-adjustment.entity';
import { StockAudit, StockAuditLine } from '../modules/inventory/stock-movements/entities/stock-audit.entity';
import {
  StockTransfer,
  StockTransferLine,
} from '../modules/inventory/stock-movements/entities/stock-transfer.entity';
import { PurchaseReceipt } from '../modules/inventory/stock-movements/entities/purchase-receipt.entity';

// Sales
import { Quotation, QuotationLine } from '../modules/sales/quotations/entities/quotation.entity';
import { GuidelinePriceSheet, GuidelinePriceLine } from '../modules/sales/guideline-prices/entities/guideline-price.entity';
import {
  SalesOrder,
  SalesOrderLine,
  DeliveryNote,
} from '../modules/sales/sales-orders/entities/sales-order.entity';
import {
  SalesInvoice,
  SalesInvoiceLine,
  SalesReturn,
  SalesReturnLine,
} from '../modules/sales/sales-invoices/entities/sales-invoice.entity';
import { SalesPayment } from '../modules/sales/sales-payments/entities/sales-payment.entity';
import { InstallmentPlan, InstallmentPlanLine } from '../modules/sales/installment-plans/entities/installment-plan.entity';
import { InstallmentScheduleItem } from '../modules/sales/installment-plans/entities/installment-schedule-item.entity';
import { InstallmentPayment } from '../modules/sales/installment-plans/entities/installment-payment.entity';
import { Employee } from '../modules/hr/entities/employee.entity';
import { EmployeeLeave } from '../modules/hr/entities/employee-leave.entity';
import { PayrollRun, PayrollRunLine } from '../modules/hr/entities/payroll-run.entity';

import { CashMovement } from '../modules/treasury/entities/cash-movement.entity';
import { RecurringExpense } from '../modules/treasury/entities/recurring-expense.entity';
import { ImportCargoItem } from '../modules/imports/entities/import-cargo-item.entity';
import { Shipment } from '../modules/imports/entities/shipment.entity';
import { ShipmentExpense } from '../modules/imports/entities/shipment-expense.entity';
import { ShipmentPayment } from '../modules/imports/entities/shipment-payment.entity';
import { ShippingExpenseType } from '../modules/imports/entities/shipping-expense-type.entity';
import { WhatsAppOutboxMessage } from '../modules/whatsapp/entities/whatsapp-outbox-message.entity';
import { BackupRecord } from '../modules/backups/entities/backup-record.entity';
import { AcSupplierPayment } from '../modules/ac-supplier-ledger/entities/ac-supplier-payment.entity';
import { AcSupplierTaxPayment } from '../modules/ac-supplier-ledger/entities/ac-supplier-tax-payment.entity';
import { SharedDocument } from '../modules/shared-documents/entities/shared-document.entity';

export const allEntities = [
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
  User,
  Role,
  Permission,
  Session,
  UserCompany,
  AuditLog,
  Customer,
  Supplier,
  SupplierPayment,
  SalesRepresentative,
  CommissionException,
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
  Quotation,
  QuotationLine,
  GuidelinePriceSheet,
  GuidelinePriceLine,
  SalesOrder,
  SalesOrderLine,
  DeliveryNote,
  SalesInvoice,
  SalesInvoiceLine,
  SalesReturn,
  SalesReturnLine,
  SalesPayment,
  InstallmentPlan,
  InstallmentPlanLine,
  InstallmentScheduleItem,
  InstallmentPayment,
  Employee,
  EmployeeLeave,
  PayrollRun,
  PayrollRunLine,
  CashMovement,
  RecurringExpense,
  ImportCargoItem,
  Shipment,
  ShipmentExpense,
  ShipmentPayment,
  ShippingExpenseType,
  WhatsAppOutboxMessage,
  BackupRecord,
  AcSupplierPayment,
  AcSupplierTaxPayment,
  SharedDocument,
];

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'erp_user',
  password: process.env.DB_PASSWORD || 'erp_password',
  database: process.env.DB_DATABASE || 'erp_db',
  entities: allEntities,
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
});
