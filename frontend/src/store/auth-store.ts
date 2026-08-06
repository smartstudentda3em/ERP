import { create } from 'zustand';

export interface AuthUser {
  id: string;
  phone: string;
  email?: string | null;
  fullName: string;
  companyId: string | null;
  branchId: string | null;
  permissions: string[];
  /** True only for the real, unmodifiable Administrator/Super-Admin role — a UI-nicety signal for
   * hiding/locking sensitive controls (Factory Reset, sales-rep assignment). The actual security
   * boundary for anything sensitive is always re-checked server-side, never trusted from here. */
  isSystemRole: boolean;
  /** True for a true Administrator — implicit access to every company; companyIds is irrelevant for them. */
  allCompanies: boolean;
  /** The companies this user may access/switch into (ignored when allCompanies is true). */
  companyIds: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  isHydrated: boolean;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (prefix: string) => boolean;
  setHydrated: () => void;
  /** Patches the stored user in place (e.g. after the "Account Settings" self-service profile
   * edit changes the email) — keeps the token as-is, unlike setSession which replaces both. */
  updateUser: (patch: Partial<AuthUser>) => void;
}

export const OFFLINE_TOKEN = 'offline-demo-token';
const OFFLINE_SESSION_KEY = 'erp_offline_session';

export function restoreOfflineSession(): { accessToken: string; user: AuthUser } | null {
  try {
    const raw = localStorage.getItem(OFFLINE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  isHydrated: false,
  setSession: (accessToken, user) => {
    if (accessToken === OFFLINE_TOKEN) {
      localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify({ accessToken, user }));
    }
    set({ accessToken, user });
  },
  clearSession: () => {
    localStorage.removeItem(OFFLINE_SESSION_KEY);
    set({ accessToken: null, user: null });
  },
  hasPermission: (code: string) => {
    const permissions = get().user?.permissions ?? [];
    return permissions.includes('*') || permissions.includes(code);
  },
  hasAnyPermission: (prefix: string) => {
    const permissions = get().user?.permissions ?? [];
    return permissions.includes('*') || permissions.some((p) => p.startsWith(prefix));
  },
  setHydrated: () => set({ isHydrated: true }),
  updateUser: (patch) => {
    const current = get();
    if (!current.user) return;
    const nextUser = { ...current.user, ...patch };
    if (current.accessToken === OFFLINE_TOKEN) {
      localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify({ accessToken: current.accessToken, user: nextUser }));
    }
    set({ user: nextUser });
  },
}));
