import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsSalesRep } from '../../lib/use-active-company';
import { useAuthStore } from '../../store/auth-store';

/**
 * Blocks a route for a "مندوب" (Sales Rep) user specifically. That role is granted customers.view
 * and settings.warehouse.view purely so the Sales Invoice form's customer/warehouse pickers can
 * list options on the STAT/AC company path (see SALES_REP_PERMISSION_CODES in run-seed.ts) — those
 * permissions must never actually unlock the full Customers/Outstanding Balances/Warehouse
 * Management screens, which the role's spec explicitly excludes (Sidebar.tsx's hideForSalesRep only
 * hides the nav link, not the route itself). Redirects to /sales/invoices, mirroring
 * DefaultRedirect.tsx's fallback for a role without dashboard.view.
 */
export function RequireNotSalesRep({ children }: { children: ReactNode }) {
  const isSalesRep = useIsSalesRep();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  if (isSalesRep) {
    return <Navigate to={hasPermission('dashboard.view') ? '/dashboard' : '/sales/invoices'} replace />;
  }
  return <>{children}</>;
}
