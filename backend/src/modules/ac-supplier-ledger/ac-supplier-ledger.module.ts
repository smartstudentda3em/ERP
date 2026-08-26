import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcSupplierPayment } from './entities/ac-supplier-payment.entity';
import { AcSupplierTaxPayment } from './entities/ac-supplier-tax-payment.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Company } from '../settings/entities/company.entity';
import { AcSupplierPaymentsController, AcSupplierTaxPaymentsController } from './ac-supplier-ledger.controller';
import { AcSupplierPaymentsService } from './ac-supplier-payments.service';
import { AcSupplierTaxPaymentsService } from './ac-supplier-tax-payments.service';
import { TreasuryModule } from '../treasury/treasury.module';

/**
 * Air Conditioning company only — supplier-debt-payment and sales-tax logs. Both
 * AcSupplierPaymentsService ("تسجيل دفعة") and AcSupplierTaxPaymentsService ("تسجيل ضريبة") depend
 * on TreasuryModule/CashMovementsService — each recorded entry really debits the chosen Cash/Bank
 * account, see their respective create()/remove().
 */
@Module({
  imports: [TypeOrmModule.forFeature([AcSupplierPayment, AcSupplierTaxPayment, Supplier, Company]), TreasuryModule],
  controllers: [AcSupplierPaymentsController, AcSupplierTaxPaymentsController],
  providers: [AcSupplierPaymentsService, AcSupplierTaxPaymentsService],
  // AcSupplierPaymentsService is also used directly by PurchaseReceiptsService (InventoryModule)
  // for the "رصيد المورد" payment-source deduction — see that service's create()/update()/remove().
  exports: [AcSupplierPaymentsService],
})
export class AcSupplierLedgerModule {}
