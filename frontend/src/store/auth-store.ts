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
  /** Every role name this user holds (e.g. ['Manager'], ['مدير فرع']) — permission codes alone
   * can't distinguish "Manager" from "مدير فرع" since both hold overlapping (additive)
   * permissions. Only use this for the rare UI restriction that must key off the literal role
   * name rather than a specific permission — see hasRole below. */
  roleNames: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  isHydrated: boolean;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (prefix: string) => boolean;
  hasRole: (name: string) => boolean;
  setHydrated: () => void;
  /** Patches the stored user in place (e.g. after the "Account Settings" self-service profile
   * edit changes the email) — keeps the token as-is, unlike setSession which replaces both. */
  updateUser: (patch: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  isHydrated: false,
  setSession: (accessToken, user) => set({ accessToken, user }),
  clearSession: () => set({ accessToken: null, user: null }),
  hasPermission: (code: string) => {
    const permissions = get().user?.permissions ?? [];
    return permissions.includes('*') || permissions.includes(code);
  },
  hasAnyPermission: (prefix: string) => {
    const permissions = get().user?.permissions ?? [];
    return permissions.includes('*') || permissions.some((p) => p.startsWith(prefix));
  },
  hasRole: (name: string) => (get().user?.roleNames ?? []).includes(name),
  setHydrated: () => set({ isHydrated: true }),
  updateUser: (patch) => {
    const current = get();
    if (!current.user) return;
    set({ user: { ...current.user, ...patch } });
  },
}));
