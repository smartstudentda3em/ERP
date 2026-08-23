import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useIsBranchManager } from '../../lib/use-active-company';
import { useAuthStore } from '../../store/auth-store';

/**
 * Blocks a route for a "مدير فرع" (Branch Manager) user specifically — mirrors RequireNotSalesRep.
 * That role is granted customers.view purely so the Sales Invoice/Quotation forms' customer picker
 * can list options (see BRANCH_MANAGER_PERMISSION_CODES in run-seed.ts) — that permission must never
 * actually unlock the Outstanding Balances screens, which the role's spec explicitly excludes
 * (Sidebar.tsx's hideForBranchManager only hides the nav link, not the route itself). Redirects to
 * /sales/invoices, mirroring DefaultRedirect.tsx's fallback for a role without dashboard.view.
 */
export function RequireNotBranchManager({ children }: { children: ReactNode }) {
  const isBranchManager = useIsBranchManager();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  if (isBranchManager) {
    return <Navigate to={hasPermission('dashboard.view') ? '/dashboard' : '/sales/invoices'} replace />;
  }
  return <>{children}</>;
}
