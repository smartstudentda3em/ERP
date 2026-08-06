import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Company } from '../../settings/entities/company.entity';
import { Customer } from '../../parties/customers/entities/customer.entity';
import { WhatsAppOutboxMessage } from '../../whatsapp/entities/whatsapp-outbox-message.entity';
import { WHATSAPP_PROVIDER, WhatsAppNotifier } from '../../whatsapp/whatsapp-notifier.interface';
import { CustomerCreditStatus, WhatsAppMessageType } from '../../../entities/enums';

const AUTO_BLACKLIST_OVERDUE_DAYS = 30;

/**
 * Daily WhatsApp-style notification pass — follows the exact shape of
 * RecurringExpensesService.generateDueExpenses(): a plain @Cron method on an @Injectable service,
 * no separate scheduler abstraction. Sends through WhatsAppNotifier (currently the dashboard-log
 * placeholder provider, confirmed with the user since no real WhatsApp API credentials exist yet).
 */
@Injectable()
export class InstallmentsNotificationCron {
  private readonly logger = new Logger(InstallmentsNotificationCron.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(WhatsAppOutboxMessage) private readonly outboxRepo: Repository<WhatsAppOutboxMessage>,
    @Inject(WHATSAPP_PROVIDER) private readonly whatsapp: WhatsAppNotifier,
  ) {}

  @Cron('0 8 * * *')
  async generateDailyNotifications(): Promise<void> {
    const companies = await this.companyRepo.find();
    for (const company of companies) {
      await this.sendAdminDailyReport(company);
      await this.sendCustomerReminders(company);
      await this.autoBlacklistOverdueCustomers(company);
    }
  }

  private async sendAdminDailyReport(company: Company): Promise<void> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('si.id', 'id')
      .addSelect('si."installmentNumber"', 'installmentNumber')
      .addSelect('si."dueDate"', 'dueDate')
      .addSelect('si."amountDue"', 'amountDue')
      .addSelect('c.name', 'customerName')
      .addSelect(
        `COALESCE((SELECT SUM(ip.amount) FROM installment_payments ip WHERE ip."scheduleItemId" = si.id), 0)`,
        'paid',
      )
      .from('installment_schedule_items', 'si')
      .innerJoin('installment_plans', 'p', 'p.id = si."installmentPlanId"')
      .innerJoin('customers', 'c', 'c.id = p."customerId"')
      .where('p."companyId" = :companyId', { companyId: company.id })
      .andWhere(`p.status = 'ACTIVE'`)
      .andWhere('si."dueDate" <= CURRENT_DATE')
      .getRawMany();

    const dueOrOverdue = rows
      .map((r) => ({ ...r, remaining: Number(r.amountDue) - Number(r.paid) }))
      .filter((r) => r.remaining > 0.005);
    if (dueOrOverdue.length === 0) return;

    const lines = dueOrOverdue.map(
      (r) => `- ${r.customerName}: قسط رقم ${r.installmentNumber}, تاريخ الاستحقاق ${r.dueDate}, المتبقي ${r.remaining.toFixed(2)}`,
    );
    const content = `تقرير الأقساط المستحقة اليوم والمتأخرة — ${company.nameAr}:\n${lines.join('\n')}`;
    await this.whatsapp.send({
      companyId: company.id,
      messageType: WhatsAppMessageType.ADMIN_DAILY_REPORT,
      recipientLabel: 'الإدارة',
      content,
    });
  }

  private async sendCustomerReminders(company: Company): Promise<void> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('si.id', 'id')
      .addSelect('si."dueDate"', 'dueDate')
      .addSelect('si."amountDue"', 'amountDue')
      .addSelect('c.id', 'customerId')
      .addSelect('c.name', 'customerName')
      .addSelect('c.mobile', 'customerMobile')
      .from('installment_schedule_items', 'si')
      .innerJoin('installment_plans', 'p', 'p.id = si."installmentPlanId"')
      .innerJoin('customers', 'c', 'c.id = p."customerId"')
      .where('p."companyId" = :companyId', { companyId: company.id })
      .andWhere(`p.status = 'ACTIVE'`)
      .andWhere(`si."dueDate" BETWEEN (CURRENT_DATE + INTERVAL '2 days') AND (CURRENT_DATE + INTERVAL '3 days')`)
      .getRawMany();

    for (const row of rows) {
      const alreadySentToday = await this.outboxRepo
        .createQueryBuilder('w')
        .where('w."relatedScheduleItemId" = :itemId', { itemId: row.id })
        .andWhere(`w."messageType" = 'CUSTOMER_REMINDER'`)
        .andWhere('w."createdAt"::date = CURRENT_DATE')
        .getOne();
      if (alreadySentToday) continue;

      const content = `تذكير: يستحق عليكم قسط بتاريخ ${row.dueDate} بمبلغ ${Number(row.amountDue).toFixed(2)}.`;
      await this.whatsapp.send({
        companyId: company.id,
        messageType: WhatsAppMessageType.CUSTOMER_REMINDER,
        recipientLabel: row.customerName,
        recipientPhone: row.customerMobile,
        content,
        relatedScheduleItemId: row.id,
      });
    }
  }

  private async autoBlacklistOverdueCustomers(company: Company): Promise<void> {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select('DISTINCT p."customerId"', 'customerId')
      .from('installment_schedule_items', 'si')
      .innerJoin('installment_plans', 'p', 'p.id = si."installmentPlanId"')
      .where('p."companyId" = :companyId', { companyId: company.id })
      .andWhere(`p.status = 'ACTIVE'`)
      .andWhere(`si."dueDate" < (CURRENT_DATE - INTERVAL '${AUTO_BLACKLIST_OVERDUE_DAYS} days')`)
      .andWhere(
        `si."amountDue" > COALESCE((SELECT SUM(ip.amount) FROM installment_payments ip WHERE ip."scheduleItemId" = si.id), 0)`,
      )
      .getRawMany();

    for (const row of rows) {
      const customer = await this.customerRepo.findOne({ where: { id: row.customerId } });
      if (!customer || customer.creditStatus === CustomerCreditStatus.BLOCKED) continue;

      customer.creditStatus = CustomerCreditStatus.BLOCKED;
      customer.blockedReason = `حظر تلقائي: تأخر السداد أكثر من ${AUTO_BLACKLIST_OVERDUE_DAYS} يومًا`;
      await this.customerRepo.save(customer);

      await this.whatsapp.send({
        companyId: company.id,
        messageType: WhatsAppMessageType.ADMIN_DAILY_REPORT,
        recipientLabel: 'الإدارة',
        content: `تنبيه: تم حظر العميل "${customer.name}" تلقائيًا من عقود التقسيط الجديدة بسبب تأخر السداد أكثر من ${AUTO_BLACKLIST_OVERDUE_DAYS} يومًا.`,
      });
      this.logger.log(`Auto-blacklisted customer ${customer.id} (overdue > ${AUTO_BLACKLIST_OVERDUE_DAYS} days).`);
    }
  }
}
