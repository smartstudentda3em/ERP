import { BadRequestException } from '@nestjs/common';
import { CashMovementAccount } from '../../entities/enums';

/**
 * Companies where every sales/purchase transaction must explicitly record which treasury account
 * (بنك/كاش) it hits, rather than the account being silently derived (e.g. from a generic payment
 * `method`) or defaulted to CASH. Printing Press had this from the start; Stationery and Air
 * Conditioning were added per the same request — named by company code, not a feature flag, so a
 * future 4th company that shouldn't have this requirement doesn't silently inherit it.
 */
export const PAYMENT_ACCOUNT_REQUIRED_COMPANY_CODES = new Set(['PRESS', 'STAT', 'AC']);

export function requiresPaymentAccountSelection(companyCode: string | undefined | null): boolean {
  return !!companyCode && PAYMENT_ACCOUNT_REQUIRED_COMPANY_CODES.has(companyCode);
}

/** Throws when `companyCode` is one of the companies above and no account was actually supplied —
 * makes the frontend's required بنك/كاش selector an enforced rule, not just a UI nicety. */
export function assertPaymentAccountProvided(
  companyCode: string | undefined | null,
  paymentAccount: CashMovementAccount | null | undefined,
): void {
  if (requiresPaymentAccountSelection(companyCode) && !paymentAccount) {
    throw new BadRequestException('يجب تحديد الحساب (بنك أو كاش) لهذه العملية.');
  }
}
