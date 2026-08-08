import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/auth-store';
import { apiClient } from '../../lib/api-client';

export function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setSession = useAuthStore((s) => s.setSession);
  const setHydrated = useAuthStore((s) => s.setHydrated);

  useEffect(() => {
    if (accessToken) {
      setHydrated();
      return;
    }

    apiClient
      .post('/auth/refresh')
      .then((res) => setSession(res.data.data.accessToken, res.data.data.user))
      .catch(() => undefined)
      .finally(() => setHydrated());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}

export function RequireAuth() {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) return <Navigate to="/login" replace />;
  return <Outlet />;
}
