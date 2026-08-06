import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { PayrollRun, PayrollRunLine } from './entities/payroll-run.entity';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { SettingsModule } from '../settings/settings.module';
import { TreasuryModule } from '../treasury/treasury.module';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, PayrollRun, PayrollRunLine]), SettingsModule, TreasuryModule],
  controllers: [EmployeesController, PayrollController],
  providers: [EmployeesService, PayrollService],
  exports: [TypeOrmModule, PayrollService],
})
export class HrModule {}
