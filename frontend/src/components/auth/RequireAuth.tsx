import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { restoreOfflineSession, useAuthStore } from '../../store/auth-store';
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

    // Restore a locally-saved offline demo session before trying the real backend, so
    // reloading the page doesn't force logging in again when there's no backend to ask.
    const offline = restoreOfflineSession();
    if (offline) {
      setSession(offline.accessToken, offline.user);
      setHydrated();
      return;
    }

    apiClient
      .post('/auth/refresh')
      .then((res) => setSession(res.data.accessToken, res.data.user))
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
