import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from './api-client';
import { useAuthStore } from '../store/auth-store';

export interface ActiveCompany {
  id: string;
  code: string;
  nameAr?: string | null;
  nameEn?: string | null;
  warnOnSellBelowCost?: boolean;
}

/** The Printing Press company's fixed code — mirrors backend/src/database/seeds/run-seed.ts's
 * COMPANY_DEFS and frontend/src/lib/offline-store.ts's OFFLINE_COMPANY_DEFS ('PRESS'). Business
 * rules scoped to that one tenant (hiding Customers, forcing a walk-in customer on sales) check
 * against this constant rather than a hardcoded company id, so they keep working across both the
 * offline demo and a real deployment. */
export const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

/** The Air Conditioning company's fixed code — mirrors backend/src/database/seeds/run-seed.ts's
 * COMPANY_DEFS and frontend/src/lib/offline-store.ts's OFFLINE_COMPANY_DEFS ('AC'). Business rules
 * scoped to that one tenant (the Installments module) check against this constant rather than a
 * hardcoded company id. */
export const AIR_CONDITIONING_COMPANY_CODE = 'AC';

/** Resolves the currently active company's full row (not just its id) — shared by the Sidebar,
 * the Printing-Press route guard, and the sales screens that need to know whether the active
 * tenant is the Printing Press. `isLoading` lets callers avoid a flash of the wrong UI before the
 * companies list resolves. */
export function useActiveCompany() {
  const companyId = useAuthStore((s) => s.user?.companyId);
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<ActiveCompany[]>(apiClient.get('/settings/companies')),
    enabled: !!companyId,
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? null;
  return {
    company,
    isPrintingPress: company?.code === PRINTING_PRESS_COMPANY_CODE,
    isAirConditioning: company?.code === AIR_CONDITIONING_COMPANY_CODE,
    isLoading: companiesQuery.isLoading,
  };
}
