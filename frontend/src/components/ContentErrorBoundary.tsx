import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
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
export function ContentErrorBoundary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const error = useRouteError();

  // eslint-disable-next-line no-console
  console.error('Content error boundary caught:', error);

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-4xl">⚠️</div>
      <h1 className="text-lg font-semibold text-[var(--text)]">{t('errorBoundary.title')}</h1>
      <p className="max-w-md text-sm text-[var(--text-muted)]">{t('errorBoundary.description')}</p>
      <p className="max-w-md break-words text-xs text-[var(--text-muted)]" dir="ltr">
        {message}
      </p>
      <div className="flex gap-2">
        {/* Going back returns to whatever list/page the user was on (e.g. المشتريات) without a
            full browser reload — safe as long as the DOM corruption was scoped to this route's
            own subtree, which it always is here since AppLayout itself never unmounted. */}
        <Button variant="secondary" onClick={() => navigate(-1)}>
          {t('errorBoundary.goBack')}
        </Button>
        <Button onClick={() => navigate('/dashboard')}>{t('errorBoundary.goHome')}</Button>
      </div>
    </div>
  );
}
