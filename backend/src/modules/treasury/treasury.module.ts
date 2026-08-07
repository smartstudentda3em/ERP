import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashBox, BankAccount, CashTransaction, Transfer } from './entities/treasury.entity';
import { CashMovement } from './entities/cash-movement.entity';
import { RecurringExpense } from './entities/recurring-expense.entity';
import {
  CashBoxesController,
  CashBoxesService,
  BankAccountsController,
  BankAccountsService,
} from './treasury.controller';
import { CashMovementsService } from './cash-movements.service';
import { CashMovementsController } from './cash-movements.controller';
import { RecurringExpensesController, RecurringExpensesService } from './recurring-expenses.controller';
import { PartnersTreasuryController } from './partners-treasury.controller';
import { SettingsModule } from '../settings/settings.module';
import { Partner } from '../settings/entities/partner.entity';
import { Company } from '../settings/entities/company.entity';
import { SalesRepresentative } from '../parties/entities/sales-representative.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CashBox,
      BankAccount,
      CashTransaction,
      Transfer,
      CashMovement,
      RecurringExpense,
      Partner,
      Company,
      SalesRepresentative,
    ]),
    SettingsModule,
  ],
  controllers: [
    CashBoxesController,
    BankAccountsController,
    CashMovementsController,
    RecurringExpensesController,
    PartnersTreasuryController,
  ],
  providers: [CashBoxesService, BankAccountsService, CashMovementsService, RecurringExpensesService],
  exports: [TypeOrmModule, CashMovementsService],
})
export class TreasuryModule {}
