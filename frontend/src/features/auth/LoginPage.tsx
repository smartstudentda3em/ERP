import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const ADMIN_PHONE = '99970766';

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
      setSession(res.data.data.accessToken, res.data.data.user);
      navigate('/select-company');
    },
    onError: (err: any) => {
      // Surfaces the backend's actual reason (wrong credentials vs. a temporary lockout vs. an
      // inactive account) instead of a single generic message — a locked-out user typing their
      // correct password over and over previously saw the exact same "wrong credentials" text as
      // someone who'd genuinely mistyped it, with no way to tell the two apart.
      setError(err?.response?.data?.message ?? t('auth.invalidCredentials'));
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
