import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';

/** Sends a logged-in user to their own home screen. Every role historically had dashboard.view,
 * so "/" and unmatched routes always went straight to /dashboard — "مندوب" is the first role that
 * doesn't (its whole screen budget is Sales Invoices + a restricted Products view, and the
 * Dashboard's financial KPIs are exactly what it's meant to never see), so this checks first and
 * falls back to the one screen that role can actually reach instead of bouncing it in a loop
 * against RequirePermission's own /dashboard fallback. */
export function DefaultRedirect() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const to = hasPermission('dashboard.view') ? '/dashboard' : '/sales/invoices';
  return <Navigate to={to} replace />;
}
