import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, FormField } from '../../components/ui/Input';
import { useToast } from '../../components/ui/Toast';

// Fixed reset code, deliberately not the caller's real account password — re-checked server-side
// in SystemService.factoryReset() before anything is deleted; this client-side copy only decides
// when the button itself becomes clickable; it is NOT the actual security boundary.
const RESET_CODE = '0145';

/**
 * Wipes every transactional/demo-master-data table back to empty while leaving configuration and
 * every login untouched (see backend SystemService.factoryReset() / offline-store.ts's
 * factoryResetDemoData() — both implement the exact same table scope).
 *
 * Gated by two independent layers, neither of which alone is trusted:
 *  1. This tab only renders for a true Administrator/Super-Admin (see SettingsPage.tsx) — but
 *     that's a UI nicety, trivially bypassed via devtools, so it's never the real security boundary.
 *  2. `system.delete` permission, enforced server-side (@Permissions guard / offline route check)
 *     — rejects any other role outright.
 * Plus a fixed reset code (RESET_CODE above) re-verified server-side on every call.
 */
export function FactoryResetTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');

  const resetMutation = useMutation({
    mutationFn: () => apiClient.post('/system/factory-reset', { password }),
    onSuccess: async () => {
      setPassword('');
      // A targeted invalidate list would need to enumerate every query key in the app and risks
      // missing one; a full clear+refetch is the only way to guarantee nothing stale survives on
      // screen after a reset this broad.
      await queryClient.invalidateQueries();
      toast.success(t('factoryReset.success'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('factoryReset.error'));
    },
  });

  const canConfirm = password === RESET_CODE;

  return (
    <Card className="max-w-2xl border-red-300 dark:border-red-800/60">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-red-700 dark:text-red-400">{t('factoryReset.warningTitle')}</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('factoryReset.warningBody')}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm font-semibold text-red-700 dark:text-red-400">{t('factoryReset.willDeleteTitle')}</div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('factoryReset.willDeleteItems')}</p>
        </div>
        <div>
          <div className="text-sm font-semibold text-green-700 dark:text-green-400">{t('factoryReset.willKeepTitle')}</div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('factoryReset.willKeepItems')}</p>
        </div>
      </div>

      <form
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canConfirm) resetMutation.mutate();
        }}
      >
        <div className="max-w-xs">
          <FormField label={t('factoryReset.confirmPasswordLabel')}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('factoryReset.confirmPasswordPlaceholder') ?? ''}
              autoComplete="off"
            />
          </FormField>
        </div>

        <div className="mt-4">
          <Button
            type="submit"
            variant="secondary"
            className="border-red-600 bg-red-600 text-white hover:bg-red-700"
            disabled={!canConfirm || resetMutation.isPending}
          >
            {resetMutation.isPending ? t('factoryReset.confirming') : t('factoryReset.confirmButton')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
