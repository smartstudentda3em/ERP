import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeeLeave } from './entities/employee-leave.entity';
import { PayrollRun, PayrollRunLine } from './entities/payroll-run.entity';
import { Company } from '../settings/entities/company.entity';
import { SalesRepresentative } from '../parties/entities/sales-representative.entity';
import { CommissionException } from '../parties/entities/commission-exception.entity';
import { RepFixedItemCommission } from '../parties/entities/rep-fixed-item-commission.entity';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { SettingsModule } from '../settings/settings.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { SalesRepAccessModule } from '../../common/sales-rep-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      EmployeeLeave,
      PayrollRun,
      PayrollRunLine,
      Company,
      SalesRepresentative,
      CommissionException,
      RepFixedItemCommission,
    ]),
    SettingsModule,
    TreasuryModule,
    SalesRepAccessModule,
  ],
  controllers: [EmployeesController, PayrollController],
  providers: [EmployeesService, PayrollService],
  exports: [TypeOrmModule, PayrollService],
})
export class HrModule {}
