import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhatsAppOutboxMessage } from './entities/whatsapp-outbox-message.entity';
import { WhatsAppOutboxController } from './whatsapp-outbox.controller';
import { DashboardWhatsAppProvider } from './dashboard-whatsapp.provider';
import { WHATSAPP_PROVIDER } from './whatsapp-notifier.interface';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsAppOutboxMessage])],
  controllers: [WhatsAppOutboxController],
  providers: [DashboardWhatsAppProvider, { provide: WHATSAPP_PROVIDER, useExisting: DashboardWhatsAppProvider }],
  exports: [TypeOrmModule, WHATSAPP_PROVIDER],
})
export class WhatsAppModule {}
