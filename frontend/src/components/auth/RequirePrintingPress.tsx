import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useActiveCompany } from '../../lib/use-active-company';

/**
 * Restricts a route to the Printing Press tenant exclusively (confirmed scope: every other
 * company has no access) — mirrors RequireAirConditioning's exact shape for the opposite tenant.
 * Waits for the companies list to resolve before deciding, so a hard refresh never flashes the
 * page for a split second before redirecting.
 */
export function RequirePrintingPress({ children }: { children: ReactNode }) {
  const { isPrintingPress, isLoading } = useActiveCompany();
  if (isLoading) return null;
  if (!isPrintingPress) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
