import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useActiveCompany } from '../../lib/use-active-company';
import { useAuthStore } from '../../store/auth-store';

const SEGMENT_LABEL_KEYS: Record<string, string> = {
  dashboard: 'nav.dashboard',
  customers: 'nav.customers',
  'outstanding-balances': 'nav.outstandingBalances',
  'outstanding-balance': 'nav.customerAccount',
  suppliers: 'nav.suppliers',
  'sales-representatives': 'nav.salesRepresentatives',
  inventory: 'nav.inventory',
  products: 'nav.products',
  warehouses: 'nav.warehouseManagement',
  stock: 'nav.stock',
  sales: 'nav.sales',
  quotations: 'nav.quotations',
  orders: 'nav.salesOrders',
  invoices: 'nav.salesInvoices',
  payments: 'nav.salesPayments',
  purchasing: 'nav.purchasing',
  treasury: 'nav.treasuryGroup',
  transactions: 'nav.treasury',
  'rep-treasuries': 'treasury.repTreasuriesBalance',
  expenses: 'nav.expenses',
  accounting: 'nav.accounting',
  reports: 'nav.reports',
  'users-roles': 'nav.usersRoles',
  settings: 'nav.settings',
  partners: 'nav.partners',
  statement: 'nav.statement',
  hr: 'nav.hrGroup',
  employees: 'nav.employees',
  payroll: 'nav.payroll',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Breadcrumbs() {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  // Same signal Sidebar.tsx uses: a مدير فرع (Branch Manager) is the only role without
  // sales-representatives.view, so this doubles as "is the logged-in user a مدير فرع".
  const isBranchManagerSelf = useAuthStore((s) => !s.hasPermission('sales-representatives.view'));
  const location = useLocation();
  // Slicing must always be done against the RAW (unfiltered) segments — a UUID segment shifts
  // every later segment's real index, so slicing against the UUID-filtered list instead (as this
  // used to) builds a truncated link for anything after an id, e.g. /customers/:id/statement's
  // "Statement" crumb pointed at /customers/:id instead of /customers/:id/statement.
  const rawSegments = location.pathname.split('/').filter(Boolean);

  if (rawSegments.length === 0) return null;

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-[var(--text-muted)] print:hidden">
      <Link to="/dashboard" className="hover:underline">
        {t('nav.home')}
      </Link>
      {rawSegments.map((seg, i) => {
        if (UUID_PATTERN.test(seg)) {
          // /outstanding-balances/:id has no real path segment of its own to label — this
          // synthesizes one so its breadcrumb reads ".../الأرصدة المستحقة/الرصيد المستحق" instead
          // of the id silently disappearing like other UUID segments do.
          if (rawSegments[i - 1] !== 'outstanding-balances') return null;
          const path = '/' + rawSegments.slice(0, i + 1).join('/');
          return (
            <span key={path} className="flex items-center gap-1">
              <span>/</span>
              <Link to={path} className="capitalize hover:underline">
                {t('actions.balanceDue')}
              </Link>
            </span>
          );
        }
        const path = '/' + rawSegments.slice(0, i + 1).join('/');
        const labelKey =
          seg === 'sales-representatives' && isBranchManagerSelf
            ? 'nav.branchManager'
            : isPrintingPress && seg === 'sales-representatives'
              ? 'nav.salesRepresentativesPress'
              : isPrintingPress && seg === 'suppliers'
                ? 'nav.importsPress'
                : SEGMENT_LABEL_KEYS[seg];
        const label = labelKey ? t(labelKey) : seg.replace(/-/g, ' ');
        return (
          <span key={path} className="flex items-center gap-1">
            <span>/</span>
            <Link to={path} className="capitalize hover:underline">
              {label}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}
