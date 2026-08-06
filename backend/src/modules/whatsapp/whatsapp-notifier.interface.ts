import { WhatsAppMessageType } from '../../entities/enums';

export interface WhatsAppSendInput {
  companyId: string;
  messageType: WhatsAppMessageType;
  recipientLabel: string;
  recipientPhone?: string | null;
  content: string;
  relatedInstallmentPlanId?: string | null;
  relatedScheduleItemId?: string | null;
}

/** DI token — a future real provider (Meta Cloud API, Twilio, ...) implements this same interface
 * and is swapped in via WhatsAppModule's providers array; nothing else in the codebase changes. */
export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';

export interface WhatsAppNotifier {
  send(input: WhatsAppSendInput): Promise<void>;
}
