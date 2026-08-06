import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { OfflineApiError, resolveOfflineUser } from '../../lib/offline-store';
import { OFFLINE_TOKEN, useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const ADMIN_PHONE = '99970766';
const OFFLINE_DEMO_PASSWORD = 'Ayman987654#';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [phone, setPhone] = useState(ADMIN_PHONE);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => apiClient.post('/auth/login', { phone, password }),
    onSuccess: (res) => {
      setSession(res.data.accessToken, res.data.user);
      navigate('/select-company');
    },
    onError: () => {
      // No backend reachable (or real credentials rejected) — fall back to an offline demo
      // session so the UI shell is still explorable without a running API. Real data won't
      // load anywhere until the actual backend + database are up; see docs/INSTALLATION.md.
      // Any seeded/created offline user can log in this way (not just the admin account), so
      // roles like Manager can actually be tried out — the shared demo password stands in for
      // per-user passwords, since the mock never stores real credentials.
      if (password.trim() === OFFLINE_DEMO_PASSWORD) {
        try {
          const offlineUser = resolveOfflineUser(phone);
          if (offlineUser) {
            setSession(OFFLINE_TOKEN, offlineUser);
            navigate('/select-company');
            return;
          }
        } catch (err) {
          // Distinguishes "not authorized for any company" from "wrong credentials" — thrown by
          // resolveOfflineUser() when a non-admin user has no accessible companies at all.
          setError(err instanceof OfflineApiError ? err.message : t('auth.invalidCredentials'));
          return;
        }
      }
      setError(t('auth.invalidCredentials'));
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    loginMutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-6">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">🧮</div>
          <h1 className="text-lg font-semibold">{t('app.title')}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">{t('auth.welcomeBack')}</p>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            {t('auth.phone')}
          </label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
            required
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
            {t('auth.password')}
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
          {loginMutation.isPending ? t('common.loading') : t('auth.signIn')}
        </Button>
      </form>
    </div>
  );
}
