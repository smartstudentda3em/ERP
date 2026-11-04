import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';

/** Route guard for the founder-only activity log. A UI nicety — the API's FounderGuard is the real
 * boundary and returns 403 to anyone else regardless of what the browser shows. */
export function RequireFounder({ children }: { children: ReactNode }) {
  const isFounder = useAuthStore((s) => s.user?.isFounder ?? false);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  if (!isFounder) {
    return <Navigate to={hasPermission('dashboard.view') ? '/dashboard' : '/sales/invoices'} replace />;
  }
  return <>{children}</>;
}
