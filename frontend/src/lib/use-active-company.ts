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

/** The Stationery & Printing Supplies company's fixed code — mirrors
 * backend/src/database/seeds/run-seed.ts's COMPANY_DEFS. */
export const STATIONERY_COMPANY_CODE = 'STAT';

/** Resolves the currently active company's full row (not just its id) — shared by the Sidebar,
 * the Printing-Press route guard, and the sales screens that need to know whether the active
 * tenant is the Printing Press. `isLoading` lets callers avoid a flash of the wrong UI before the
 * companies list resolves.
 *
 * Deliberately queries /auth/my-companies (no permission required beyond being authenticated) —
 * NOT /settings/companies (settings.company.view-gated, meant for the Company management CRUD
 * tab). A role like "مدير فرع" (Branch Manager) has neither settings.company.view nor any reason
 * to, so the settings-gated endpoint 403'd for it silently, which left `isPrintingPress` always
 * false for that role and broke every guard/UI branch keyed off it (wrong "المنتجات" page shown,
 * RequirePrintingPress routes unreachable, Press-only invoice fields missing, etc.) — same
 * reasoning as useAccessibleCompanies() in lib/companies.ts, which already solved this for the
 * company switcher; this hook shares its query key so the two never fetch twice. */
export function useActiveCompany() {
  const companyId = useAuthStore((s) => s.user?.companyId);
  const companiesQuery = useQuery({
    queryKey: ['accessible-companies'],
    queryFn: () => unwrap<ActiveCompany[]>(apiClient.get('/auth/my-companies')),
    enabled: !!companyId,
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? null;
  return {
    company,
    isPrintingPress: company?.code === PRINTING_PRESS_COMPANY_CODE,
    isAirConditioning: company?.code === AIR_CONDITIONING_COMPANY_CODE,
    isStationery: company?.code === STATIONERY_COMPANY_CODE,
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

/** True for a "مندوب" (field sales agent) user, in any company — unlike
 * useIsPressManagerRestricted() this isn't scoped to Printing Press, since مندوب can exist under
 * any of the 3 companies. Drives ProductsPage.tsx's stripped-down (no price/quantity) product
 * view and hides the paymentAccount selector on the Sales Invoice form (see
 * CashMovementAccount.REP_TREASURY). */
export function useIsSalesRep(): boolean {
  return useAuthStore((s) => s.hasRole('مندوب'));
}
