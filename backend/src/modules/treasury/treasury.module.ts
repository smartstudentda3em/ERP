import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashMovement } from './entities/cash-movement.entity';
import { RecurringExpense } from './entities/recurring-expense.entity';
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
      CashMovement,
      RecurringExpense,
      Partner,
      Company,
      SalesRepresentative,
    ]),
    SettingsModule,
  ],
  controllers: [
    CashMovementsController,
    RecurringExpensesController,
    PartnersTreasuryController,
  ],
  providers: [CashMovementsService, RecurringExpensesService],
  exports: [TypeOrmModule, CashMovementsService],
})
export class TreasuryModule {}
