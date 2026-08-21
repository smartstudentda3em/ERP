import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import configuration from './config/configuration';
import { allEntities } from './database/data-source';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformResponseInterceptor } from './common/interceptors/transform-response.interceptor';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PartiesModule } from './modules/parties/parties.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { TreasuryModule } from './modules/treasury/treasury.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ImportsModule } from './modules/imports/imports.module';
import { SystemModule } from './modules/system/system.module';
import { InstallmentPlansModule } from './modules/sales/installment-plans/installment-plans.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { HrModule } from './modules/hr/hr.module';
import { BackupsModule } from './modules/backups/backups.module';
import { AcSupplierLedgerModule } from './modules/ac-supplier-ledger/ac-supplier-ledger.module';
import { SharedDocumentsModule } from './modules/shared-documents/shared-documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        entities: allEntities,
        synchronize: false,
        logging: config.get('env') === 'development',
      }),
    }),
    AuthModule,
    UsersModule,
    AuditLogModule,
    SettingsModule,
    PartiesModule,
    InventoryModule,
    SalesModule,
    TreasuryModule,
    DashboardModule,
    NotificationsModule,
    ImportsModule,
    SystemModule,
    WhatsAppModule,
    InstallmentPlansModule,
    HrModule,
    BackupsModule,
    AcSupplierLedgerModule,
    SharedDocumentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TransformResponseInterceptor },
  ],
})
export class AppModule {}
