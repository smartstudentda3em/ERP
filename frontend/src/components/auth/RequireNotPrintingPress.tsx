import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useActiveCompany } from '../../lib/use-active-company';

/**
 * Blocks a route for the Printing Press tenant specifically (confirmed scope: every other company
 * keeps full access unchanged). Waits for the companies list to resolve before deciding, so a hard
 * refresh never flashes the guarded page for a split second before redirecting. Defaults to
 * /dashboard; pass `redirectTo` when the spec calls for landing somewhere more specific (e.g.
 * /inventory/stock sends Press to the Purchasing section's Raw Materials tab instead).
 */
export function RequireNotPrintingPress({
  children,
  redirectTo = '/dashboard',
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  const { isPrintingPress, isLoading } = useActiveCompany();
  if (isLoading) return null;
  if (isPrintingPress) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
