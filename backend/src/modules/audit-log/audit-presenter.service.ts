import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FIELD_LABELS } from './audit-labels';

export interface AuditDetail {
  label: string;
  old: string;
  new: string;
}

/** Which columns of a table matter to the owner, in reading order. Anything not listed is hidden. */
const SPECS: Record<string, { fields: [string, string][]; skipIfPresent?: Record<string, string>; itemsFor?: 'invoice' }> = {
  sales_invoices: {
    fields: [
      ['documentNumber', 'رقم الفاتورة'],
      ['invoiceDate', 'التاريخ'],
      ['customerName', 'اسم العميل'],
      ['customerId', 'العميل'],
      ['customerPhone', 'هاتف العميل'],
      ['status', 'الحالة'],
      ['grandTotal', 'الإجمالي'],
      ['amountPaid', 'المدفوع'],
      ['paymentAccount', 'طريقة الدفع'],
      ['salesRepresentativeId', 'المسؤول'],
      ['assistingSalesRepresentativeId', 'المندوب'],
      ['notes', 'تفاصيل / ملاحظات'],
    ],
    skipIfPresent: { customerId: 'customerName' },
    itemsFor: 'invoice',
  },
  sales_payments: {
    fields: [
      ['documentNumber', 'رقم المقبوض'],
      ['paymentDate', 'التاريخ'],
      ['amount', 'المبلغ'],
      ['paymentAccount', 'الحساب'],
      ['method', 'طريقة الدفع'],
      ['customerId', 'العميل'],
      ['invoiceId', 'الفاتورة'],
      ['salesRepresentativeId', 'المندوب'],
      ['notes', 'ملاحظات'],
    ],
  },
  cash_movements: {
    fields: [
      ['documentNumber', 'رقم الحركة'],
      ['movementDate', 'التاريخ'],
      ['type', 'النوع'],
      ['account', 'الحساب'],
      ['amount', 'المبلغ'],
      ['sourceType', 'المصدر'],
      ['category', 'التصنيف'],
      ['description', 'البيان'],
      ['partnerId', 'الشريك'],
      ['salesRepresentativeId', 'المندوب'],
    ],
  },
  purchase_receipts: {
    fields: [
      ['documentNumber', 'رقم الفاتورة'],
      ['receiptDate', 'تاريخ الاستلام'],
      ['supplierId', 'المورد'],
      ['productId', 'الصنف'],
      ['warehouseId', 'المخزن'],
      ['quantityPackages', 'عدد العبوات'],
      ['packagePurchasePrice', 'سعر شراء العبوة'],
      ['totalAmount', 'الإجمالي'],
      ['paidAmount', 'المدفوع'],
    ],
  },
  stock_levels: {
    fields: [
      ['productId', 'الصنف'],
      ['warehouseId', 'المخزن'],
      ['quantityOnHand', 'الكمية'],
    ],
  },
};

/** Columns that hold another record's id, and where to read that record's display name from. */
const FK: Record<string, { table: string; expr: string }> = {
  customerId: { table: 'customers', expr: 'name' },
  supplierId: { table: 'suppliers', expr: '"companyName"' },
  warehouseId: { table: 'warehouses', expr: 'COALESCE("nameAr","nameEn")' },
  branchId: { table: 'branches', expr: 'COALESCE("nameAr","nameEn")' },
  companyId: { table: 'companies', expr: 'COALESCE("nameAr","nameEn")' },
  productId: { table: 'products', expr: 'COALESCE("nameAr","nameEn")' },
  partnerId: { table: 'partners', expr: 'name' },
  salesRepresentativeId: { table: 'sales_representatives', expr: 'name' },
  assistingSalesRepresentativeId: { table: 'sales_representatives', expr: 'name' },
  employeeId: { table: 'employees', expr: 'name' },
  invoiceId: { table: 'sales_invoices', expr: '"documentNumber"' },
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  status: {
    DRAFT: 'مسودة',
    CONFIRMED: 'مؤكدة',
    INVOICED: 'مفوترة',
    PAID: 'مدفوعة',
    PARTIALLY_PAID: 'مدفوعة جزئياً',
    CANCELLED: 'ملغاة',
    APPROVED: 'معتمدة',
  },
  type: { INCOME: 'وارد', EXPENSE: 'صادر' },
  account: { CASH: 'الخزينة النقدية', BANK: 'البنك', REP_TREASURY: 'خزنة المندوب' },
  paymentAccount: { CASH: 'الخزينة النقدية', BANK: 'البنك', REP_TREASURY: 'خزنة المندوب' },
  method: { CASH: 'نقدي', BANK_TRANSFER: 'تحويل بنكي', CHEQUE: 'شيك', CARD: 'بطاقة', ONLINE: 'أونلاين' },
  sourceType: {
    SALES_INVOICE: 'فاتورة بيع',
    SALES_PAYMENT: 'مقبوض',
    PURCHASE_RECEIPT: 'فاتورة شراء',
    SUPPLIER_PAYMENT: 'دفعة مورد',
    MANUAL: 'يدوي',
    CAPITAL_INJECTION: 'تسليف',
    DIVIDEND: 'توزيع أرباح',
    INSTALLMENT_PAYMENT: 'قسط',
    TRANSFER: 'تحويل بين الحسابات',
    PAYROLL: 'مرتبات',
    COMMISSION_PAYOUT: 'صرف عمولة',
    ADVANCE_REPAYMENT: 'سداد تسليف',
  },
};

const EMPTY = '—';

type Row = {
  id: string;
  source: string;
  actionType: string;
  targetModel: string | null;
  entityId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

/**
 * Turns the raw before/after JSON stored on a CHANGE row into what the owner actually wants to read:
 * only the meaningful fields, in Arabic, with ids replaced by names ("العميل: عميل" not a uuid) and
 * enum codes by words ("مدفوعة" not PAID). Done when the log is VIEWED, so it also fixes every row
 * written before this existed — the stored rows themselves are never touched (they can't be).
 */
@Injectable()
export class AuditPresenter {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async attachDetails<T extends Row>(rows: T[]): Promise<(T & { details: AuditDetail[] })[]> {
    const changeRows = rows.filter((r) => r.source === 'CHANGE' && (r.oldValues || r.newValues));
    const names = await this.resolveNames(changeRows);
    const invoiceItems = await this.loadInvoiceItems(changeRows);

    return rows.map((r) => {
      if (!changeRows.includes(r)) return { ...r, details: [] };
      return { ...r, details: this.build(r, names, invoiceItems) };
    });
  }

  private async resolveNames(rows: Row[]): Promise<Map<string, string>> {
    const idsByTable = new Map<string, { expr: string; ids: Set<string> }>();
    for (const r of rows) {
      for (const values of [r.oldValues, r.newValues]) {
        for (const [k, v] of Object.entries(values ?? {})) {
          const fk = FK[k];
          if (fk && typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)) {
            if (!idsByTable.has(fk.table)) idsByTable.set(fk.table, { expr: fk.expr, ids: new Set() });
            idsByTable.get(fk.table)!.ids.add(v);
          }
        }
      }
    }
    const out = new Map<string, string>();
    for (const [table, { expr, ids }] of idsByTable) {
      try {
        const found: { id: string; n: string | null }[] = await this.dataSource.query(
          `SELECT id, ${expr} AS n FROM ${table} WHERE id = ANY($1::uuid[])`,
          [[...ids]],
        );
        for (const f of found) out.set(f.id, f.n ?? EMPTY);
      } catch {
        /* a lookup failing must never hide the row itself */
      }
    }
    return out;
  }

  /** The items sold, read from the invoice's lines (those aren't audited row by row). */
  private async loadInvoiceItems(rows: Row[]): Promise<Map<string, string>> {
    const ids = rows
      .filter((r) => r.targetModel === 'sales_invoices' && r.actionType === 'CREATE' && r.entityId)
      .map((r) => r.entityId as string);
    const out = new Map<string, string>();
    if (!ids.length) return out;
    try {
      const lines: { invoiceId: string; n: string; q: string; t: string }[] = await this.dataSource.query(
        `SELECT l."invoiceId", COALESCE(p."nameAr", p."nameEn") AS n, l.quantity AS q, l."lineTotal" AS t
           FROM sales_invoice_lines l JOIN products p ON p.id = l."productId"
          WHERE l."invoiceId" = ANY($1::uuid[]) ORDER BY l."createdAt"`,
        [ids],
      );
      for (const l of lines) {
        const line = `${l.n} × ${this.num(l.q)} = ${this.num(l.t)}`;
        out.set(l.invoiceId, out.has(l.invoiceId) ? `${out.get(l.invoiceId)}\n${line}` : line);
      }
    } catch {
      /* ignore */
    }
    return out;
  }

  private num(v: unknown): string {
    const n = Number(v);
    return Number.isFinite(n) ? String(Math.round(n * 10000) / 10000) : String(v);
  }

  private format(key: string, v: unknown, names: Map<string, string>): string {
    if (v === null || v === undefined || v === '') return EMPTY;
    if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
    if (FK[key] && typeof v === 'string') return names.get(v) ?? '(محذوف)';
    if (typeof v === 'string' && VALUE_LABELS[key]?.[v]) return VALUE_LABELS[key][v];
    if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.includes('.'))) return this.num(v);
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return v.slice(0, 10);
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  private build(r: Row, names: Map<string, string>, invoiceItems: Map<string, string>): AuditDetail[] {
    const spec = r.targetModel ? SPECS[r.targetModel] : undefined;
    const keys: [string, string][] = spec
      ? spec.fields
      : [...new Set([...Object.keys(r.oldValues ?? {}), ...Object.keys(r.newValues ?? {})])]
          .filter((k) => FIELD_LABELS[k])
          .map((k) => [k, FIELD_LABELS[k]]);
    const isCreate = r.actionType === 'CREATE';
    const isDelete = r.actionType === 'DELETE';
    const details: AuditDetail[] = [];

    for (const [key, label] of keys) {
      const inOld = !!r.oldValues && key in r.oldValues;
      const inNew = !!r.newValues && key in r.newValues;
      if (!inOld && !inNew) continue;
      const skipper = spec?.skipIfPresent?.[key];
      if (skipper) {
        const other = (r.newValues ?? r.oldValues)?.[skipper];
        if (other) continue;
      }
      const oldText = inOld ? this.format(key, r.oldValues![key], names) : EMPTY;
      const newText = inNew ? this.format(key, r.newValues![key], names) : EMPTY;
      if (oldText === newText) continue;
      if (isCreate && newText === EMPTY) continue;
      if (isDelete && oldText === EMPTY) continue;
      details.push({ label, old: oldText, new: newText });
    }

    if (isCreate && spec?.itemsFor === 'invoice' && r.entityId && invoiceItems.has(r.entityId)) {
      details.push({ label: 'الأصناف', old: EMPTY, new: invoiceItems.get(r.entityId)! });
    }
    return details;
  }
}
