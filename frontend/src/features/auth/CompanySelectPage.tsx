import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { switchOfflineCompanyRequest } from '../../lib/offline-store';
import { useAccessibleCompanies } from '../../lib/companies';
import { OFFLINE_TOKEN, useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';

/**
 * Shown right after login whenever the user has a real choice to make (more than one accessible
 * company) — a single-company user never sees this screen at all, they land straight on the
 * dashboard. An Administrator always sees every company here; anyone else sees only the companies
 * an admin explicitly assigned them to (see UsersRolesPage.tsx's company multi-select).
 */
export function CompanySelectPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const companiesQuery = useAccessibleCompanies();
  const companies = companiesQuery.data ?? [];

  async function pick(companyId: string) {
    setError(null);
    setSwitching(companyId);
    try {
      let result: { accessToken: string; user: any };
      if (accessToken === OFFLINE_TOKEN) {
        result = switchOfflineCompanyRequest(companyId);
      } else {
        const res = await apiClient.post('/auth/switch-company', { companyId });
        result = res.data.data;
      }
      setSession(result.accessToken, result.user);
      await queryClient.clear();
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? t('common.saveFailed'));
      setSwitching(null);
    }
  }

  // Single accessible company (or none) — no real choice to make, so skip straight through
  // instead of forcing an extra click every login.
  useEffect(() => {
    if (companies.length === 1) {
      pick(companies[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies.length]);

  if (companiesQuery.isLoading || companies.length <= 1) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
        <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🏢</div>
          <h1 className="text-lg font-semibold">{t('companySelect.title')}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('companySelect.subtitle')}</p>
        </div>

        {error && <p className="mb-4 text-center text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {companies.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={!!switching}
              onClick={() => pick(c.id)}
              className="card flex items-center gap-3 p-4 text-start transition hover:border-primary-500 disabled:opacity-60"
            >
              {c.logoUrl ? (
                <img src={c.logoUrl} alt="" className="h-10 w-10 flex-none rounded object-contain" />
              ) : (
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700 dark:bg-primary-500/15 dark:text-primary-400">
                  {(i18n.language === 'ar' ? c.nameAr : c.nameEn)?.charAt(0) ?? '?'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{i18n.language === 'ar' ? c.nameAr : c.nameEn}</div>
              </div>
              {switching === c.id && <span className="text-xs text-[var(--text-muted)]">{t('common.loading')}</span>}
            </button>
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              useAuthStore.getState().clearSession();
              navigate('/login');
            }}
          >
            {t('nav.logout')}
          </Button>
        </div>
      </div>
    </div>
  );
}
