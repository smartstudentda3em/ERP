import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { AuditLogService } from './audit-log.service';
import { AuditEventsController, AuditLogController } from './audit-log.controller';
import { AuditRecorder } from './audit-recorder.service';
import { AuditSubscriber } from './audit.subscriber';
import { AuditPresenter } from './audit-presenter.service';
import { AuditLogBootstrap } from './audit-log.bootstrap';
import { FounderGuard } from '../../common/guards/founder.guard';

// Global so the app-wide AuditLogInterceptor (registered in AppModule) can inject AuditRecorder.
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, User])],
  controllers: [AuditLogController, AuditEventsController],
  providers: [AuditLogService, AuditRecorder, AuditSubscriber, AuditPresenter, AuditLogBootstrap, FounderGuard],
  exports: [TypeOrmModule, AuditRecorder],
})
export class AuditLogModule {}
