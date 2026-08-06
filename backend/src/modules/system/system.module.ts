import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { SystemService } from './system.service';
import { SystemController } from './system.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
