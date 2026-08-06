import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Exact permission code required to see this item. Omit for items every logged-in user can see. */
  permission?: string;
  /** Match `to` exactly rather than as a prefix — needed when a sibling route (e.g. /sales/invoices) shares this item's path as a prefix. */
  end?: boolean;
  /** Hidden specifically for the Printing Press tenant (confirmed scope: every other company keeps
   * this item unchanged) — see RequireNotPrintingPress for the matching route guard. */
  hideForPrintingPress?: boolean;
  /** Shown ONLY for the Air Conditioning tenant, hidden for every other company (including
   * Printing Press) — see RequireAirConditioning for the matching route guard. */
  requireAirConditioning?: boolean;
  /** Shown ONLY for the Printing Press tenant, hidden for every other company — see
   * RequirePrintingPress for the matching route guard. */
  requirePrintingPress?: boolean;
}

// Order below follows the required sequence exactly: لوحة التحكم، المشتريات، المنتجات، المخازن،
// مدراء الفروع، عروض الأسعار، فواتير البيع، المبيعات، المقبوضات، حركة الخزينة، الموظفين، الرواتب،
// المصروفات، الشركاء، التقارير المالية، المستخدمون والأدوار، الإعدادات. Items not named in that
// spec (customers/outstanding balances, stock audit/movement, printing products, installments) are
// each kept immediately beside the closest listed sibling they belong to, so the relative order of
// every named item stays exactly as specified regardless of which company is active.
const items: NavItem[] = [
  { to: '/dashboard', label: 'nav.dashboard', icon: '📊' },
  { to: '/customers', label: 'nav.customers', icon: '🧑‍💼', permission: 'customers.view', hideForPrintingPress: true },
  {
    to: '/outstanding-balances',
    label: 'nav.outstandingBalances',
    icon: '💸',
    permission: 'customers.view',
    hideForPrintingPress: true,
  },
  { to: '/suppliers', label: 'nav.imports', icon: '🏭', permission: 'suppliers.view' },
  {
    to: '/purchasing',
    label: 'nav.purchasing',
    icon: '🛒',
    permission: 'inventory.purchaseReceipt.view',
    // Moved into the "المشتريات" section as its own "فاتورة الشراء" sub-tab for Printing Press —
    // see SuppliersPage.tsx.
    hideForPrintingPress: true,
  },
  {
    to: '/inventory/products',
    label: 'nav.products',
    icon: '📦',
    permission: 'inventory.product.view',
    // Moved into the "المشتريات" section as its own "المواد الخام" sub-tab for Printing Press —
    // see SuppliersPage.tsx.
    hideForPrintingPress: true,
  },
  {
    to: '/sales/products',
    label: 'nav.printingProducts',
    icon: '📇',
    permission: 'inventory.product.view',
    requirePrintingPress: true,
  },
  {
    to: '/inventory/warehouses',
    label: 'nav.warehouseManagement',
    icon: '🏬',
    permission: 'settings.warehouse.view',
  },
  {
    to: '/inventory/stock-audit',
    label: 'nav.stockAudit',
    icon: '📋',
    permission: 'inventory.stockAudit.view',
    requirePrintingPress: true,
  },
  {
    to: '/inventory/stock',
    label: 'nav.stock',
    icon: '📈',
    permission: 'inventory.stock.view',
    // Printing Press has no use for stock-movement tracking on raw materials bought purely for
    // production — see RequireNotPrintingPress usage on this route in router.tsx for the matching
    // redirect (lands on المشتريات's المواد الخام tab instead of the generic dashboard).
    hideForPrintingPress: true,
  },
  {
    to: '/sales-representatives',
    label: 'nav.salesRepresentatives',
    icon: '🧑‍💻',
    permission: 'sales-representatives.view',
  },
  { to: '/sales/quotations', label: 'nav.quotations', icon: '📝', permission: 'sales.quotation.view' },
  { to: '/sales/invoices', label: 'nav.salesInvoices', icon: '💳', permission: 'sales.invoice.view' },
  { to: '/sales', label: 'nav.sales', icon: '🛍️', permission: 'sales.invoice.view', end: true },
  // Deliberately a different code from sales.payment.view: that code also gates the embedded
  // receipts fetch/collect-payment actions inside the Customer Balance and Sales Invoice detail
  // pages, which roles like Manager need even while the standalone payments list page itself
  // (and this nav item) stay hidden from them.
  { to: '/sales/payments', label: 'nav.salesPayments', icon: '💰', permission: 'sales.paymentList.view' },
  {
    to: '/installments',
    label: 'nav.installments',
    icon: '🗓️',
    permission: 'sales.installmentPlan.view',
    end: true,
    requireAirConditioning: true,
  },
  {
    to: '/installments/reports',
    label: 'nav.installmentsReports',
    icon: '📑',
    permission: 'sales.installmentPlan.view',
    requireAirConditioning: true,
  },
  { to: '/treasury/transactions', label: 'nav.treasury', icon: '🏦', permission: 'treasury.cash-box.view' },
  // "الموظفين" — applies to every company/branch, no requirePrintingPress/requireAirConditioning flag.
  { to: '/hr/employees', label: 'nav.employees', icon: '🧑‍💼', permission: 'hr.employee.view' },
  { to: '/hr/payroll', label: 'nav.payroll', icon: '💰', permission: 'hr.payroll.view' },
  { to: '/treasury/expenses', label: 'nav.expenses', icon: '🧾', permission: 'treasury.expense.view' },
  { to: '/partners', label: 'nav.partners', icon: '🤝', permission: 'partners.view' },
  { to: '/accounting/reports', label: 'nav.reports', icon: '📉', permission: 'accounting.reports.view' },
  { to: '/users-roles', label: 'nav.usersRoles', icon: '🔐', permission: 'users.view' },
  // Not settings.warehouse.view — see RequirePermission usage on the /settings route for why.
  { to: '/settings', label: 'nav.settings', icon: '⚙️', permission: 'settings.company.view' },
];

export function Sidebar({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { isPrintingPress, isAirConditioning } = useActiveCompany();
  const visibleItems = items.filter(
    (item) =>
      (!item.permission || hasPermission(item.permission)) &&
      !(item.hideForPrintingPress && isPrintingPress) &&
      !(item.requireAirConditioning && !isAirConditioning) &&
      !(item.requirePrintingPress && !isPrintingPress),
  );

  return (
    <aside
      className={`fixed inset-y-0 start-0 z-40 w-64 shrink-0 border-e border-[var(--border)] bg-[var(--surface)] transition-transform print:hidden lg:translate-x-0 lg:rtl:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full'
      }`}
    >
      <div className="flex h-14 items-center gap-2 border-b border-[var(--border)] px-4">
        <span className="text-lg">🧮</span>
        <span className="truncate text-sm font-semibold">{t('app.title')}</span>
      </div>
      <nav className="flex flex-col gap-0.5 overflow-y-auto p-2" style={{ height: 'calc(100% - 56px)' }}>
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-[var(--text)] hover:bg-black/5 dark:hover:bg-white/5'
              }`
            }
          >
            <span>{item.icon}</span>
            <span className="truncate">
              {t(
                isPrintingPress && item.to === '/sales-representatives'
                  ? 'nav.salesRepresentativesPress'
                  : isPrintingPress && item.to === '/suppliers'
                    ? 'nav.importsPress'
                    : item.label,
              )}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
