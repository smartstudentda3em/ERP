import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostCenter, Project, Budget } from './cost-centers/entities/cost-center.entity';

import {
  CostCentersController,
  CostCentersService,
  ProjectsController,
  ProjectsService,
  BudgetsController,
  BudgetsService,
} from './cost-centers/cost-centers.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([CostCenter, Project, Budget]), SettingsModule],
  controllers: [CostCentersController, ProjectsController, BudgetsController],
  providers: [CostCentersService, ProjectsService, BudgetsService],
  exports: [TypeOrmModule],
})
export class AccountingModule {}
