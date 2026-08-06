import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useActiveCompany } from '../../lib/use-active-company';

/**
 * Restricts the Installments routes to the Air Conditioning tenant exclusively (confirmed scope:
 * every other company, including Printing Press, has no access). Waits for the companies list to
 * resolve before deciding, so a hard refresh never flashes the Installments page for a split
 * second before redirecting.
 */
export function RequireAirConditioning({ children }: { children: ReactNode }) {
  const { isAirConditioning, isLoading } = useActiveCompany();
  if (isLoading) return null;
  if (!isAirConditioning) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
