import { AuditActionType } from './entities/audit-log.entity';

/** Arabic name of each audited table (what the owner sees as "الجدول المستهدف"). */
export const MODEL_LABELS: Record<string, string> = {
  sales_invoices: 'فاتورة بيع',
  sales_payments: 'مقبوض',
  sales_returns: 'مرتجع مبيعات',
  sales_orders: 'أمر بيع',
  quotations: 'عرض سعر',
  delivery_notes: 'إذن تسليم',
  customers: 'عميل',
  sales_representatives: 'مندوب / مدير فرع',
  purchase_receipts: 'فاتورة شراء',
  suppliers: 'مورد',
  supplier_payments: 'دفعة مورد',
  products: 'صنف',
  stock_levels: 'رصيد مخزن',
  stock_adjustments: 'تسوية مخزون',
  stock_transfers: 'تحويل مخزني',
  stock_audits: 'جرد',
  warehouses: 'مخزن',
  cash_movements: 'حركة خزينة',
  recurring_expenses: 'مصروف متكرر',
  expense_categories: 'فئة مصروفات',
  partners: 'شريك',
  employees: 'موظف',
  employee_leaves: 'إجازة موظف',
  payroll_runs: 'مسير مرتبات',
  users: 'مستخدم',
  roles: 'دور',
  user_companies: 'صلاحية شركة لمستخدم',
  branches: 'فرع',
  companies: 'شركة',
  month_closings: 'تقفيل شهر',
  shipments: 'شحنة',
  shipment_expenses: 'مصروف شحنة',
  shipment_payments: 'دفعة شحنة',
  commission_exceptions: 'استثناء عمولة',
  rep_fixed_item_commissions: 'عمولة ثابتة',
  installment_plans: 'خطة تقسيط',
  installment_payments: 'دفعة قسط',
  shared_documents: 'مستند مشترك',
  fiscal_years: 'سنة مالية',
  currencies: 'عملة',
  taxes: 'ضريبة',
  units: 'وحدة',
  brands: 'علامة تجارية',
  product_categories: 'فئة منتجات',
  package_types: 'نوع عبوة',
};

/** Tables whose row-level changes are noise (derived, counters, sessions…) — never audited per row. */
export const SKIPPED_TABLES = new Set([
  'audit_logs',
  'sessions',
  'numbering_series',
  'whatsapp_outbox_messages',
  'backup_records',
  'stock_movements',
  'product_batches',
  'permissions',
  'user_permissions',
]);
export const isSkippedTable = (table: string) => SKIPPED_TABLES.has(table) || /_lines?$/.test(table);

/** Columns that change on their own and must not, alone, count as a user-made modification. */
export const IGNORED_COLUMNS = new Set([
  'updatedAt',
  'lastLoginAt',
  'failedLoginAttempts',
  'lockedUntil',
  'refreshTokenHash',
]);

const SENSITIVE = /password|token|secret|hash/i;

/** Redacts anything that looks like a credential before it is ever stored. */
export function redact(values: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!values) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) out[k] = SENSITIVE.test(k) ? '***' : v;
  return out;
}

/** Arabic names for the columns that show up most; anything else is shown by its own key. */
export const FIELD_LABELS: Record<string, string> = {
  status: 'الحالة',
  grandTotal: 'الإجمالي',
  amountPaid: 'المبلغ المدفوع',
  amount: 'المبلغ',
  invoiceDate: 'تاريخ الفاتورة',
  paymentDate: 'تاريخ الدفع',
  movementDate: 'تاريخ الحركة',
  receiptDate: 'تاريخ الاستلام',
  quantity: 'الكمية',
  quantityPackages: 'عدد العبوات',
  packagePurchasePrice: 'سعر شراء العبوة',
  unitCost: 'تكلفة الوحدة',
  name: 'الاسم',
  nameAr: 'الاسم بالعربية',
  nameEn: 'الاسم بالإنجليزية',
  fullName: 'الاسم الكامل',
  phone: 'الهاتف',
  email: 'البريد الإلكتروني',
  isActive: 'مفعّل',
  commissionRate: 'نسبة العمولة',
  description: 'الوصف',
  notes: 'ملاحظات',
  customerName: 'اسم العميل',
  salesRepresentativeId: 'المندوب',
  assistingSalesRepresentativeId: 'المندوب المساعد',
  warehouseId: 'المخزن',
  branchId: 'الفرع',
  supplierId: 'المورد',
  customerId: 'العميل',
  isClosed: 'مقفول',
  sharePercentage: 'نسبة الشريك',
};

const VERB: Record<string, string> = {
  CREATE: 'إنشاء',
  UPDATE: 'تعديل',
  DELETE: 'حذف',
  APPROVE: 'اعتماد',
};

/** "تعديل فاتورة بيع INV-000012 (الحالة، المبلغ المدفوع)" — what a human would write in a ledger. */
export function buildDescription(
  actionType: AuditActionType,
  modelLabel: string,
  ref: string | null,
  changedFields?: string[],
  special?: { isClosed?: boolean },
): string {
  if (modelLabel === 'تقفيل شهر' && special?.isClosed !== undefined) {
    return `${special.isClosed ? 'قفل' : 'فتح'} شهر ${ref ?? ''}`.trim();
  }
  const head = `${VERB[actionType] ?? 'إجراء على'} ${modelLabel}${ref ? ` ${ref}` : ''}`;
  if (actionType !== 'UPDATE' && actionType !== 'APPROVE') return head;
  const fields = (changedFields ?? []).slice(0, 5).map((f) => FIELD_LABELS[f] ?? f);
  return fields.length ? `${head} (${fields.join('، ')}${(changedFields?.length ?? 0) > 5 ? '…' : ''})` : head;
}

/** Route-prefix → Arabic label, for request-level rows that have no entity behind them. */
const ROUTE_LABELS: [RegExp, string][] = [
  [/^\/?api\/auth\/login/, 'تسجيل الدخول'],
  [/^\/?api\/auth\/logout/, 'تسجيل الخروج'],
  [/^\/?api\/sales\/invoices/, 'فاتورة بيع'],
  [/^\/?api\/sales\/payments/, 'مقبوض'],
  [/^\/?api\/treasury/, 'الخزينة'],
  [/^\/?api\/users/, 'المستخدمون'],
  [/^\/?api\/system\/factory-reset/, 'تصفير البيانات'],
  [/^\/?api\/backups/, 'النسخ الاحتياطي'],
  [/^\/?api\/settings\/month-closings/, 'تقفيل الشهور'],
];
export function routeLabel(path: string): string | null {
  const clean = path.split('?')[0];
  return ROUTE_LABELS.find(([re]) => re.test(clean))?.[1] ?? null;
}
