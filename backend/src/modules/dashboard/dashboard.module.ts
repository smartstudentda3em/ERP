import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { TreasuryModule } from '../treasury/treasury.module';
import { SalesRepAccessModule } from '../../common/sales-rep-access.module';

@Module({
  imports: [TreasuryModule, SalesRepAccessModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
