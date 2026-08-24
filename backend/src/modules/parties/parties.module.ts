import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './customers/entities/customer.entity';
import { Supplier } from './suppliers/entities/supplier.entity';
import { User } from '../users/entities/user.entity';
import { SalesRepresentative } from './entities/sales-representative.entity';
import { CommissionException } from './entities/commission-exception.entity';
import { RepFixedItemCommission } from './entities/rep-fixed-item-commission.entity';
import { SettingsModule } from '../settings/settings.module';
import { TreasuryModule } from '../treasury/treasury.module';
import { HrModule } from '../hr/hr.module';
import { SalesRepAccessModule } from '../../common/sales-rep-access.module';

import { CustomersController } from './customers/customers.controller';
import { CustomersService } from './customers/customers.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import {
  SalesRepresentativesController,
  SalesRepresentativesService,
} from './sales-representatives.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Supplier, SalesRepresentative, CommissionException, RepFixedItemCommission, User]),
    SettingsModule,
    TreasuryModule,
    HrModule,
    SalesRepAccessModule,
  ],
  controllers: [CustomersController, SuppliersController, SalesRepresentativesController],
  providers: [CustomersService, SuppliersService, SalesRepresentativesService],
  exports: [TypeOrmModule],
})
export class PartiesModule {}
