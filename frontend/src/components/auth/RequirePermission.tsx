import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';

/**
 * Gates a route by the logged-in user's permissions. Pass `code` for an exact permission check,
 * or `prefix` for an "any permission under this module" check (used for Settings, which has no
 * single blanket permission — only per-tab ones like settings.branch.view/settings.tax.view/...).
 * Redirects to the dashboard rather than showing a blank/broken page, since every seeded role
 * that can log in at all is guaranteed dashboard access.
 */
export function RequirePermission({
  code,
  prefix,
  children,
}: {
  code?: string;
  prefix?: string;
  children: ReactNode;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const allowed = code ? hasPermission(code) : prefix ? hasAnyPermission(prefix) : true;
  if (!allowed) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
