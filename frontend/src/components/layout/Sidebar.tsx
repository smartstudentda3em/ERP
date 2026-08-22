import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany, useIsSalesRep, useIsBranchManager } from '../../lib/use-active-company';

interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Exact permission code required to see this item. Omit for items every logged-in user can see. */
  permission?: string;
  /** Exact-match OR across a fixed list of unrelated permission codes — used instead of `permission`
   * when an item must stay reachable by two independent audiences (e.g. an admin-only permission and
   * a self-service one every role already has). Ignored when `permission` is also set. */
  permissionAnyOf?: string[];
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
  /** Hidden for a "مدير فرع" (Branch Manager) user specifically — a role scoped exclusively to
   * the Printing Press company (restrictedCompanyId in run-seed.ts), so this is inherently a
   * Press-only restriction without needing its own requirePrintingPress flag too. Detected via
   * isBranchManagerSelf, the same "lacks sales-representatives.view" signal already used below to
   * swap this role's المناديب nav item to their personal مدير الفرع dashboard link. */
  hideForBranchManager?: boolean;
  /** Hidden for a "مندوب" (Sales Rep) user specifically — that role is granted customers.view and
   * settings.warehouse.view purely so the Sales Invoice form's customer/warehouse pickers work on
   * the STAT/AC company path (see SALES_REP_PERMISSION_CODES in run-seed.ts); those permissions
   * must never unlock the Customers/Outstanding Balances/Warehouse Management screens themselves,
   * which the role's spec explicitly excludes. */
  hideForSalesRep?: boolean;
}

// Order below follows the required sequence exactly: لوحة التحكم، المشتريات، المنتجات، المخازن،
// مدراء الفروع، عروض الأسعار، فواتير البيع، المبيعات، المقبوضات، حركة الخزينة، الموظفين،
// المصروفات، الشركاء، التقارير المالية، المستخدمون والأدوار، الإعدادات. "الرواتب" no longer has its
// own entry here — it's the second tab inside "الموظفين" itself (see EmployeesPage.tsx /
// PayrollTab.tsx), for every company. Items not named in that spec (customers/outstanding balances,
// stock audit/movement, printing products, installments) are each kept immediately beside the
// closest listed sibling they belong to, so the relative order of every named item stays exactly as
// specified regardless of which company is active. This is the default order for every company
// EXCEPT Stationery/Air Conditioning, which reorder it via STATIONERY_NAV_ORDER /
// AIR_CONDITIONING_NAV_ORDER below instead of changing this base array.
const items: NavItem[] = [
  // No `permission` here for every other role (implicitly always visible) — but "مندوب" has no
  // dashboard.view at all, so this now hides for it specifically instead of linking to a route it
  // can't actually enter (see router.tsx's matching RequirePermission guard).
  { to: '/dashboard', label: 'nav.dashboard', icon: '📊', permission: 'dashboard.view' },
  {
    // Deliberately no hideForSalesRep here (unlike outstanding-balances below) — مندوب/مدير فرع
    // are meant to reach this one, landing on the stripped-down RepCustomersView (see router.tsx).
    to: '/customers',
    label: 'nav.customers',
    icon: '🧑‍💼',
    permission: 'customers.view',
    hideForPrintingPress: true,
  },
  {
    to: '/outstanding-balances',
    label: 'nav.outstandingBalances',
    icon: '💸',
    permission: 'customers.view',
    hideForPrintingPress: true,
    hideForSalesRep: true,
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
    hideForSalesRep: true,
  },
  {
    to: '/inventory/stock-audit',
    label: 'nav.stockAudit',
    icon: '📋',
    permission: 'inventory.stockAudit.view',
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
    permissionAnyOf: ['sales-representatives.view', 'dashboard.view'],
  },
  { to: '/sales/quotations', label: 'nav.quotations', icon: '📝', permission: 'sales.quotation.view' },
  { to: '/sales/invoices', label: 'nav.salesInvoices', icon: '💳', permission: 'sales.invoice.view' },
  {
    // Deliberately no hideForBranchManager here anymore — مدير فرع is meant to reach this "جدول
    // مبيعات" now too, seeing their own branch's sales (SalesReportPage.tsx already locks the
    // branch filter to their own rep's branch, same as it always did for مندوب).
    to: '/sales',
    label: 'nav.sales',
    icon: '🛍️',
    permission: 'sales.invoice.view',
    end: true,
  },
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
  { to: '/treasury/transactions', label: 'nav.treasury', icon: '🏦', permission: 'treasury.cash-box.view' },
  // "الموظفين" — applies to every company/branch, no requirePrintingPress/requireAirConditioning flag.
  // "الرواتب" no longer has its own sidebar entry or route — it's now the second tab inside
  // "الموظفين" itself (see EmployeesPage.tsx / PayrollTab.tsx), applied to every company.
  { to: '/hr/employees', label: 'nav.employees', icon: '🧑‍💼', permission: 'hr.employee.view' },
  { to: '/treasury/expenses', label: 'nav.expenses', icon: '🧾', permission: 'treasury.expense.view' },
  { to: '/partners', label: 'nav.partners', icon: '🤝', permission: 'partners.view' },
  { to: '/accounting/reports', label: 'nav.reports', icon: '📉', permission: 'accounting.reports.view' },
  { to: '/users-roles', label: 'nav.usersRoles', icon: '🔐', permission: 'users.view' },
  // Not settings.warehouse.view — see RequirePermission usage on the /settings route for why.
  { to: '/settings', label: 'nav.settings', icon: '⚙️', permission: 'settings.company.view' },
];

// Stationery-only nav order (explicit request, scoped to that one company only — Press and AC keep
// the default `items` order above unchanged): لوحة التحكم، العملاء، المنتجات، الاستيراد، المشتريات،
// الأرصدة المستحقة، عروض الأسعار، فواتير البيع، المبيعات، المخازن، الجرد السنوي، حركة المخزون، حركة
// الخزينة، المقبوضات، مدراء الأفرع والمناديب، الموظفين، الشركاء، المصروفات، التقارير المالية،
// المستخدمون والأدوار، الإعدادات. Applied by reordering the already-permission-filtered visibleItems
// list (see sortByOrder below) rather than duplicating item definitions — any path not listed here
// (none of Stationery's ever are; printing products/installments are Press/AC-only) just keeps its
// natural position, appended at the end.
const STATIONERY_NAV_ORDER = [
  '/dashboard',
  '/customers',
  '/inventory/products',
  '/suppliers',
  '/purchasing',
  '/outstanding-balances',
  '/sales/quotations',
  '/sales/invoices',
  '/sales',
  '/inventory/warehouses',
  '/inventory/stock-audit',
  '/inventory/stock',
  '/treasury/transactions',
  '/sales/payments',
  '/sales-representatives',
  '/hr/employees',
  '/partners',
  '/treasury/expenses',
  '/accounting/reports',
  '/users-roles',
  '/settings',
];

// Air Conditioning-only nav order (explicit request, scoped to that one company only — Press and
// Stationery each keep their own order unaffected): لوحة التحكم، العملاء، المنتجات، الاستيراد،
// المشتريات، الأرصدة المستحقة، عروض الأسعار، فواتير البيع، المبيعات، التقسيط (مباشرة تحت المبيعات)،
// المخازن، الجرد السنوي، حركة المخزون، حركة الخزينة، المقبوضات، مدراء الأفرع والمناديب، الموظفين،
// الشركاء، المصروفات، التقارير المالية، المستخدمون والأدوار، الإعدادات. "تقارير التقسيط" no longer
// has its own sidebar entry or route — it's now the second tab inside "التقسيط" itself (see
// InstallmentsPage.tsx / InstallmentsReportsTab.tsx), so /installments is this list's only
// installments-related path.
const AIR_CONDITIONING_NAV_ORDER = [
  '/dashboard',
  '/customers',
  '/inventory/products',
  '/suppliers',
  '/purchasing',
  '/outstanding-balances',
  '/sales/quotations',
  '/sales/invoices',
  '/sales',
  '/installments',
  '/inventory/warehouses',
  '/inventory/stock-audit',
  '/inventory/stock',
  '/treasury/transactions',
  '/sales/payments',
  '/sales-representatives',
  '/hr/employees',
  '/partners',
  '/treasury/expenses',
  '/accounting/reports',
  '/users-roles',
  '/settings',
];

function sortByOrder(visible: NavItem[], order: string[]): NavItem[] {
  return [...visible].sort((a, b) => {
    const ai = order.indexOf(a.to);
    const bi = order.indexOf(b.to);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export function Sidebar({ open }: { open: boolean }) {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  // "مدير فرع" specifically (role-derived, not permission-inferred) — a مندوب ALSO lacks
  // sales-representatives.view, so the old `!hasPermission('sales-representatives.view')` signal
  // this used to be actually matched both roles, silently hiding hideForBranchManager items (like
  // "/sales") from مندوب too. useIsBranchManager() checks the role name directly instead.
  const isBranchManagerSelf = useIsBranchManager();
  const isSalesRep = useIsSalesRep();
  const { isPrintingPress, isAirConditioning, isStationery } = useActiveCompany();
  const filteredItems = items.filter(
    (item) =>
      (!item.permission || hasPermission(item.permission)) &&
      (!item.permissionAnyOf || item.permissionAnyOf.some((c) => hasPermission(c))) &&
      !(item.hideForSalesRep && isSalesRep) &&
      !(item.hideForPrintingPress && isPrintingPress) &&
      !(item.requireAirConditioning && !isAirConditioning) &&
      !(item.requirePrintingPress && !isPrintingPress) &&
      !(item.hideForBranchManager && isBranchManagerSelf),
  );
  const visibleItems = isStationery
    ? sortByOrder(filteredItems, STATIONERY_NAV_ORDER)
    : isAirConditioning
      ? sortByOrder(filteredItems, AIR_CONDITIONING_NAV_ORDER)
      : filteredItems;

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
                item.to === '/sales-representatives' && isBranchManagerSelf
                  ? 'nav.branchManager'
                  : isPrintingPress && item.to === '/suppliers'
                    ? 'nav.importsPress'
                    : isAirConditioning && item.to === '/suppliers'
                      ? 'nav.suppliers'
                      : !isPrintingPress && item.to === '/inventory/stock-audit'
                        ? 'nav.stockAuditAnnual'
                        : item.label,
              )}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
