import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';

/**
 * Gates a route by the logged-in user's permissions. Pass `code` for an exact permission check,
 * `prefix` for an "any permission under this module" check (used for Settings, which has no
 * single blanket permission — only per-tab ones like settings.branch.view/settings.tax.view/...),
 * or `anyOf` for an exact-match OR across a fixed list of unrelated codes (e.g. a screen reachable
 * either by the admin-only list permission or by a self-service permission every role already has).
 * Redirects to the dashboard rather than showing a blank/broken page — or, for the one role
 * without dashboard.view at all ("مندوب"), to the one screen it can actually reach instead of
 * looping back on itself (see the fallback logic below).
 */
export function RequirePermission({
  code,
  prefix,
  anyOf,
  children,
}: {
  code?: string;
  prefix?: string;
  anyOf?: string[];
  children: ReactNode;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const allowed = anyOf
    ? anyOf.some((c) => hasPermission(c))
    : code
      ? hasPermission(code)
      : prefix
        ? hasAnyPermission(prefix)
        : true;
  if (!allowed) {
    // A role without dashboard.view (currently only "مندوب") would otherwise bounce forever
    // against a plain "/dashboard" fallback, since that route itself requires the same
    // permission — see DefaultRedirect.tsx for the same "fall back to whatever this role can
    // actually reach" logic.
    return <Navigate to={hasPermission('dashboard.view') ? '/dashboard' : '/sales/invoices'} replace />;
  }
  return <>{children}</>;
}
