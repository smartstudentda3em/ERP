import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcSupplierPayment } from './entities/ac-supplier-payment.entity';
import { AcSupplierTaxPayment } from './entities/ac-supplier-tax-payment.entity';
import { AcSupplierBonus } from './entities/ac-supplier-bonus.entity';
import { Supplier } from '../parties/suppliers/entities/supplier.entity';
import { Company } from '../settings/entities/company.entity';
import {
  AcSupplierPaymentsController,
  AcSupplierTaxPaymentsController,
  AcSupplierBonusesController,
} from './ac-supplier-ledger.controller';
import { AcSupplierPaymentsService } from './ac-supplier-payments.service';
import { AcSupplierTaxPaymentsService } from './ac-supplier-tax-payments.service';
import { AcSupplierBonusesService } from './ac-supplier-bonuses.service';
import { TreasuryModule } from '../treasury/treasury.module';

/**
 * Air Conditioning company only — supplier-debt-payment, sales-tax, and bonus logs. Both
 * AcSupplierPaymentsService ("تسجيل دفعة") and AcSupplierTaxPaymentsService ("تسجيل ضريبة") depend
 * on TreasuryModule/CashMovementsService — each recorded entry really debits the chosen Cash/Bank
 * account, see their respective create()/remove(). AcSupplierBonusesService ("البونص") is the one
 * exception — a bonus never touches the treasury, so it has no such dependency.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AcSupplierPayment, AcSupplierTaxPayment, AcSupplierBonus, Supplier, Company]),
    TreasuryModule,
  ],
  controllers: [AcSupplierPaymentsController, AcSupplierTaxPaymentsController, AcSupplierBonusesController],
  providers: [AcSupplierPaymentsService, AcSupplierTaxPaymentsService, AcSupplierBonusesService],
  // AcSupplierPaymentsService is also used directly by PurchaseReceiptsService (InventoryModule)
  // for the "رصيد المورد" payment-source deduction — see that service's create()/update()/remove().
  exports: [AcSupplierPaymentsService],
})
export class AcSupplierLedgerModule {}
