import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { Button } from './ui/Button';

/**
 * Catches render/navigation crashes anywhere under the route tree (e.g. the React "Failed to
 * execute 'insertBefore'/'removeChild' on 'Node'" error that browser extensions like Google
 * Translate cause by rewriting text nodes React still thinks it owns) so the user gets a
 * recoverable screen instead of a blank/broken page. This does not fix that DOM conflict itself
 * — see index.html's translate="no", which is the actual root-cause mitigation — it only contains
 * the blast radius of whatever does slip through.
 */
export function RouteErrorBoundary() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const error = useRouteError();

  // eslint-disable-next-line no-console
  console.error('Route error boundary caught:', error);

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] p-6 text-center">
      <div className="text-4xl">⚠️</div>
      <h1 className="text-lg font-semibold text-[var(--text)]">{t('errorBoundary.title')}</h1>
      <p className="max-w-md text-sm text-[var(--text-muted)]">{t('errorBoundary.description')}</p>
      <p className="max-w-md break-words text-xs text-[var(--text-muted)]" dir="ltr">
        {message}
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => navigate(0)}>
          {t('errorBoundary.reload')}
        </Button>
        <Button onClick={() => navigate('/dashboard')}>{t('errorBoundary.goHome')}</Button>
      </div>
    </div>
  );
}
