import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from './api-client';

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
 * the Company management CRUD tab).
 */
export function useAccessibleCompanies(enabled = true) {
  return useQuery({
    queryKey: ['accessible-companies'],
    queryFn: () => unwrap<CompanyOption[]>(apiClient.get('/auth/my-companies')),
    enabled,
  });
}
