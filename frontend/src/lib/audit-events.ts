import { apiClient } from './api-client';
import { useAuthStore } from '../store/auth-store';

/**
 * Tells the activity log that the user printed / exported a page — the browser prints without
 * calling the API, so this is the only way it can be recorded. Fire-and-forget: a failure here must
 * never get in the way of printing.
 */
export function reportPrintEvent(kind: 'PRINT' | 'EXPORT') {
  if (!useAuthStore.getState().accessToken) return;
  void apiClient
    .post('/audit-events', { kind, title: document.title?.slice(0, 150), page: window.location.pathname.slice(0, 200) })
    .catch(() => undefined);
}
