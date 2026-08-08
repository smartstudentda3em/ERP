import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from './api-client';
import { getOfflineAccessibleCompanies } from './offline-store';
import { OFFLINE_TOKEN, useAuthStore } from '../store/auth-store';

export interface CompanyOption {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  logoUrl?: string | null;
}

/**
 * The companies the CURRENT caller may access/switch into (all of them for a true Administrator,
 * otherwise just their assigned subset) — GET /auth/my-companies requires no special permission
 * beyond being authenticated, unlike /settings/companies (settings.company.view-gated, meant for
 * the Company management CRUD tab). /auth/* is excluded from api-client's offline auto-fallback,
 * so the offline branch is handled explicitly here rather than relying on that interceptor.
 */
export function useAccessibleCompanies(enabled = true) {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useQuery({
    queryKey: ['accessible-companies'],
    queryFn: async (): Promise<CompanyOption[]> => {
      if (accessToken === OFFLINE_TOKEN) return getOfflineAccessibleCompanies();
      return unwrap<CompanyOption[]>(apiClient.get('/auth/my-companies'));
    },
    enabled,
  });
}
