import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../modules/users/entities/user.entity';
import { SalesRepresentative } from '../modules/parties/entities/sales-representative.entity';
import { SalesRepAccessService } from './services/sales-rep-access.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, SalesRepresentative])],
  providers: [SalesRepAccessService],
  exports: [SalesRepAccessService],
})
export class SalesRepAccessModule {}
