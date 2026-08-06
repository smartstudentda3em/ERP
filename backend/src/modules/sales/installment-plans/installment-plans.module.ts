import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallmentPlan, InstallmentPlanLine } from './entities/installment-plan.entity';
import { InstallmentScheduleItem } from './entities/installment-schedule-item.entity';
import { InstallmentPayment } from './entities/installment-payment.entity';
import { InstallmentPlansController } from './installment-plans.controller';
import { InstallmentPlansService } from './installment-plans.service';
import { InstallmentsNotificationCron } from './installments-notification.cron';
import { SettingsModule } from '../../settings/settings.module';
import { TreasuryModule } from '../../treasury/treasury.module';
import { InventoryModule } from '../../inventory/inventory.module';
import { PartiesModule } from '../../parties/parties.module';
import { WhatsAppModule } from '../../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InstallmentPlan, InstallmentPlanLine, InstallmentScheduleItem, InstallmentPayment]),
    SettingsModule,
    TreasuryModule,
    InventoryModule,
    PartiesModule,
    WhatsAppModule,
  ],
  controllers: [InstallmentPlansController],
  providers: [InstallmentPlansService, InstallmentsNotificationCron],
  exports: [TypeOrmModule, InstallmentPlansService],
})
export class InstallmentPlansModule {}
