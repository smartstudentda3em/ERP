import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';

export interface NotificationItem {
  type: 'LOW_STOCK' | 'EXPIRED_PRODUCT' | 'DUE_RECEIVABLE' | 'FAILED_LOGIN';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  relatedId?: string;
}

/**
 * Notifications is scaffolded in this pass as a pull-based aggregation (no email/SMS/WhatsApp
 * delivery, no push/webhook infra) — see docs/ROADMAP.md. The frontend polls this endpoint.
 */
@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(user: AuthenticatedUser): Promise<NotificationItem[]> {
    const scopeToCompany = !user.allCompanies;

    const [lowStock, expired, overdue, failedLogins] = await Promise.all([
      this.dataSource
        .createQueryBuilder()
        .select('p.id', 'id')
        .addSelect('p."nameEn"', 'name')
        .from('products', 'p')
        .leftJoin('stock_levels', 'sl', 'sl."productId" = p.id')
        .where('p."isActive" = true')
        .andWhere(scopeToCompany ? 'p."companyId" = :companyId' : '1=1', { companyId: user.companyId })
        .groupBy('p.id')
        .having('COALESCE(SUM(sl."quantityOnHand"), 0) <= p."reorderLevel"')
        .getRawMany(),
      this.dataSource
        .createQueryBuilder()
        .select('b.id', 'id')
        .addSelect('p."nameEn"', 'name')
        .from('product_batches', 'b')
        .innerJoin('products', 'p', 'p.id = b."productId"')
        .where('b."expirationDate" < CURRENT_DATE')
        .andWhere('b.quantity > 0')
        .andWhere(scopeToCompany ? 'b."companyId" = :companyId' : '1=1', { companyId: user.companyId })
        .getRawMany(),
      this.dataSource
        .createQueryBuilder()
        .select('i.id', 'id')
        .addSelect('i."documentNumber"', 'documentNumber')
        .from('sales_invoices', 'i')
        .where('i."dueDate" < CURRENT_DATE')
        .andWhere("i.status NOT IN ('PAID', 'CANCELLED')")
        .andWhere(scopeToCompany ? 'i."companyId" = :companyId' : '1=1', { companyId: user.companyId })
        .getRawMany(),
      this.dataSource
        .createQueryBuilder()
        .select('u.id', 'id')
        .addSelect('u.email', 'email')
        .from('users', 'u')
        .where('u."failedLoginAttempts" >= 3')
        .andWhere(scopeToCompany ? 'u."companyId" = :companyId' : '1=1', { companyId: user.companyId })
        .getRawMany(),
    ]);

    const items: NotificationItem[] = [];
    for (const p of lowStock) {
      items.push({
        type: 'LOW_STOCK',
        severity: 'warning',
        message: `${p.name} is at or below its reorder level`,
        relatedId: p.id,
      });
    }
    for (const b of expired) {
      items.push({
        type: 'EXPIRED_PRODUCT',
        severity: 'critical',
        message: `${b.name} has expired stock still on hand`,
        relatedId: b.id,
      });
    }
    for (const i of overdue) {
      items.push({
        type: 'DUE_RECEIVABLE',
        severity: 'warning',
        message: `Invoice ${i.documentNumber} is overdue`,
        relatedId: i.id,
      });
    }
    for (const u of failedLogins) {
      items.push({
        type: 'FAILED_LOGIN',
        severity: 'critical',
        message: `Repeated failed login attempts for ${u.email}`,
        relatedId: u.id,
      });
    }
    return items;
  }
}
