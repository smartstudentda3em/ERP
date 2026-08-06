import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { Session } from './entities/session.entity';
import { UserCompany } from './entities/user-company.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';
import { PartiesModule } from '../parties/parties.module';
import { SettingsModule } from '../settings/settings.module';
import { SalesModule } from '../sales/sales.module';
import { InventoryModule } from '../inventory/inventory.module';
import { HrModule } from '../hr/hr.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission, Session, UserCompany]),
    PartiesModule,
    SettingsModule,
    SalesModule,
    InventoryModule,
    HrModule,
  ],
  controllers: [UsersController, RolesController],
  providers: [UsersService, RolesService],
  exports: [UsersService, RolesService],
})
export class UsersModule {}
