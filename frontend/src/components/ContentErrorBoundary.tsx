import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom';
import { Button } from './ui/Button';

/**
 * Same DOM-conflict crash RouteErrorBoundary guards against (e.g. "Failed to execute
 * 'insertBefore' on 'Node'" from a translation/Grammarly-style extension racing React over the
 * DOM right after a save — see that component's own comment), but declared on a pathless route
 * nested *inside* AppLayout's children (see router.tsx) rather than at the top level. React
 * Router replaces only the nearest ancestor route's own element on an uncaught render error, so
 * putting this on AppLayout itself would take the sidebar/topbar down with it; nesting it one
 * level deeper means AppLayout keeps rendering and only its <Outlet/> content — the broken page —
 * gets swapped for this screen, exactly the "contain the blast radius" behavior a page-level
 * crash (e.g. mid-render right after a Purchasing receipt save) needs.
 */
// One key, timestamped in sessionStorage rather than counted in memory — a fresh boundary
// instance mounts on every crash, so any in-memory counter would just reset to zero each time.
// Caps auto-recovery to once per 10s window: if this route keeps crashing that fast, whatever's
// racing React over the DOM is more than a one-off transient hit, and repeatedly yanking the page
// out from under the user without their input would feel worse than just letting them read the
// screen and choose — so it falls back to the plain manual buttons instead.
const AUTO_RECOVER_KEY = 'contentErrorBoundary:lastAutoRecoverAt';
const AUTO_RECOVER_COOLDOWN_MS = 10000;

export function ContentErrorBoundary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const error = useRouteError();

  // eslint-disable-next-line no-console
  console.error('Content error boundary caught:', error);

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  const lastAutoRecoverAt = Number(sessionStorage.getItem(AUTO_RECOVER_KEY) ?? 0);
  const canAutoRecover = Date.now() - lastAutoRecoverAt > AUTO_RECOVER_COOLDOWN_MS;

  // Re-enters the exact same route fresh via ordinary client-side navigation — deliberately NOT
  // window.location.reload(): a full reload would force the in-memory access token through the
  // refresh-cookie round trip (AuthBootstrap), which has been observed to hang for several
  // seconds on its own, trading one rare problem for a more common one. A short delay first so
  // the "جاري..." message is actually readable rather than flashing instantly, matching what the
  // user asked for — recover smoothly, without a jarring dead-end screen.
  useEffect(() => {
    if (!canAutoRecover) return;
    sessionStorage.setItem(AUTO_RECOVER_KEY, String(Date.now()));
    const timer = setTimeout(() => {
      navigate(location.pathname + location.search, { replace: true });
    }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-4xl">⚠️</div>
      <h1 className="text-lg font-semibold text-[var(--text)]">{t('errorBoundary.title')}</h1>
      <p className="max-w-md text-sm text-[var(--text-muted)]">
        {t(canAutoRecover ? 'errorBoundary.descriptionAutoRecover' : 'errorBoundary.description')}
      </p>
      <p className="max-w-md break-words text-xs text-[var(--text-muted)]" dir="ltr">
        {message}
      </p>
      <div className="flex gap-2">
        {/* Going back returns to whatever list/page the user was on (e.g. المشتريات) without a
            full browser reload — safe as long as the DOM corruption was scoped to this route's
            own subtree, which it always is here since AppLayout itself never unmounted. Still
            here even when auto-recovery is armed, for anyone who'd rather not wait the ~1s. */}
        <Button variant="secondary" onClick={() => navigate(-1)}>
          {t('errorBoundary.goBack')}
        </Button>
        <Button onClick={() => navigate('/dashboard')}>{t('errorBoundary.goHome')}</Button>
      </div>
    </div>
  );
}
