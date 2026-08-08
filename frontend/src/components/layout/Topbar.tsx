import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { OFFLINE_TOKEN, useAuthStore } from '../../store/auth-store';
import { useThemeStore } from '../../store/theme-store';
import { setLanguage } from '../../i18n';
import { apiClient } from '../../lib/api-client';
import { switchOfflineCompanyRequest } from '../../lib/offline-store';
import { useAccessibleCompanies } from '../../lib/companies';
import { ProfileSettingsModal } from '../../features/profile/ProfileSettingsModal';

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useThemeStore();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const setSession = useAuthStore((s) => s.setSession);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const logoutMutation = useMutation({
    mutationFn: () => apiClient.post('/auth/logout'),
    onSettled: () => {
      clearSession();
      navigate('/login');
    },
  });

  // The active company's name/logo always reflects here (request: "تغيير اسم ولوجو الشركة في
  // أعلى الصفحة") — the switcher dropdown itself only renders when there's a real choice to make.
  const companiesQuery = useAccessibleCompanies(!!user);
  const companies = companiesQuery.data ?? [];
  const activeCompany = companies.find((c) => c.id === user?.companyId);

  const switchMutation = useMutation({
    mutationFn: async (companyId: string) => {
      if (accessToken === OFFLINE_TOKEN) return switchOfflineCompanyRequest(companyId);
      const res = await apiClient.post('/auth/switch-company', { companyId });
      return res.data.data as { accessToken: string; user: any };
    },
    onSuccess: async (result) => {
      setSession(result.accessToken, result.user);
      // A company switch changes the scope of nearly every query in the app — there's no safe
      // way to enumerate just the affected keys, so a full clear+refetch is the only guarantee
      // nothing from the previous company lingers on screen.
      await queryClient.clear();
    },
  });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 print:hidden">
      <button
        className="rounded p-2 hover:bg-black/5 dark:hover:bg-white/5 lg:hidden"
        onClick={onMenuClick}
        aria-label="Menu"
      >
        ☰
      </button>
      <div className="hidden items-center gap-2 lg:flex">
        {activeCompany &&
          (companies.length > 1 ? (
            <select
              className="rounded-lg border border-[var(--border)] bg-transparent px-2 py-1 text-xs font-medium"
              value={activeCompany.id}
              disabled={switchMutation.isPending}
              onChange={(e) => switchMutation.mutate(e.target.value)}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {i18n.language === 'ar' ? c.nameAr : c.nameEn}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2 text-sm font-medium">
              {activeCompany.logoUrl && (
                <img src={activeCompany.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
              )}
              <span>{i18n.language === 'ar' ? activeCompany.nameAr : activeCompany.nameEn}</span>
            </div>
          ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
          onClick={() => setLanguage(i18n.language === 'en' ? 'ar' : 'en')}
        >
          {i18n.language === 'en' ? t('lang.ar') : t('lang.en')}
        </button>
        <button
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
          onClick={toggleTheme}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        <div className="relative" ref={menuRef}>
          <button
            className="mx-1 flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/5 sm:text-sm"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="hidden sm:inline">{user?.fullName}</span>
            <span className="sm:hidden">👤</span>
            <span className="text-[10px]">▾</span>
          </button>
          {menuOpen && (
            <div className="absolute end-0 top-full z-40 mt-1 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(true);
                }}
              >
                {t('nav.profile')}
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-start text-sm hover:bg-black/5 dark:hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  logoutMutation.mutate();
                }}
              >
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
      <ProfileSettingsModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </header>
  );
}
