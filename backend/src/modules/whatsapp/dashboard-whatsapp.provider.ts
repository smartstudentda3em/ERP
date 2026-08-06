import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsAppOutboxMessage } from './entities/whatsapp-outbox-message.entity';
import { WhatsAppNotifier, WhatsAppSendInput } from './whatsapp-notifier.interface';

/** Placeholder implementation: no real WhatsApp Business API credentials exist yet, so "sending" a
 * message just logs it into whatsapp_outbox_messages, where the Dashboard's outbox card reads it
 * back — clearly labeled as a placeholder feed, not a real delivery. */
@Injectable()
export class DashboardWhatsAppProvider implements WhatsAppNotifier {
  constructor(
    @InjectRepository(WhatsAppOutboxMessage) private readonly repo: Repository<WhatsAppOutboxMessage>,
  ) {}

  async send(input: WhatsAppSendInput): Promise<void> {
    await this.repo.save(
      this.repo.create({
        companyId: input.companyId,
        messageType: input.messageType,
        recipientLabel: input.recipientLabel,
        recipientPhone: input.recipientPhone ?? null,
        content: input.content,
        relatedInstallmentPlanId: input.relatedInstallmentPlanId ?? null,
        relatedScheduleItemId: input.relatedScheduleItemId ?? null,
        status: 'SENT',
      }),
    );
  }
}
