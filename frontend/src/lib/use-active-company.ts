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
 * COMPANY_DEFS. Business rules scoped to that one tenant (hiding Customers, forcing a walk-in
 * customer on sales) check against this constant rather than a hardcoded company id. */
export const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

/** The Air Conditioning company's fixed code — mirrors backend/src/database/seeds/run-seed.ts's
 * COMPANY_DEFS. Business rules scoped to that one tenant (the Installments module) check against
 * this constant rather than a hardcoded company id. */
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

/**
 * True only for a user holding the role literally named "Manager" (a broader, non-Press-exclusive
 * role — not "مدير فرع", a separate, already-narrower Press-only role with its own restrictions)
 * while their active company is the Printing Press. Gates a handful of UI restrictions specific to
 * exactly that combination: hiding the "فاتورة الشراء" tab (SuppliersPage.tsx), simplifying the
 * Monthly Stock Audit entry table to Item + Actual Quantity only (StockAuditPage.tsx), and hiding
 * the "صرف الأرباح" tab (SalesRepresentativesPage.tsx). Never true for Administrator, "مدير فرع",
 * or a "Manager"-role user in any other company.
 */
export function useIsPressManagerRestricted(): boolean {
  const { isPrintingPress } = useActiveCompany();
  const hasManagerRole = useAuthStore((s) => s.hasRole('Manager'));
  return isPrintingPress && hasManagerRole;
}
