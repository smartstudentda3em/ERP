import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { TreasuryModule } from '../treasury/treasury.module';
import { SalesRepAccessModule } from '../../common/sales-rep-access.module';
import { Company } from '../settings/entities/company.entity';

@Module({
  imports: [TreasuryModule, SalesRepAccessModule, TypeOrmModule.forFeature([Company])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
