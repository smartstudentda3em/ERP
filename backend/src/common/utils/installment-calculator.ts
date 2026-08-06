import { InstallmentInterestType } from '../../entities/enums';

/** Adds `months` calendar months to an ISO `YYYY-MM-DD` date, keeping the same day-of-month and
 * clamping to the last valid day when the target month is shorter (e.g. Jan 31 + 1 month = Feb 28). */
export function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);
  const mm = String(targetMonth + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${targetYear}-${mm}-${dd}`;
}

export interface InstallmentTermsInput {
  totalPrice: number;
  downPayment: number;
  interestType: InstallmentInterestType;
  interestRate: number;
  tenureMonths: number;
}

export interface InstallmentTerms {
  financedPrincipal: number;
  totalInterestAmount: number;
  totalPayable: number;
  installmentAmount: number;
}

const round = (n: number) => Math.round(n * 10000) / 10000;

/** Add-on/flat interest: computed once on the full financed principal and added on top — not an
 * amortizing/reducing-balance schedule. Matches the business spec literally ("حساب الفائدة
 * الإجمالية بناءً على اختيار شهري/سنوي وإضافتها للمبلغ المتبقي"). */
export function computeInstallmentTerms(input: InstallmentTermsInput): InstallmentTerms {
  const financedPrincipal = round(input.totalPrice - input.downPayment);
  const totalInterestAmount = round(
    input.interestType === InstallmentInterestType.MONTHLY
      ? financedPrincipal * (input.interestRate / 100) * input.tenureMonths
      : financedPrincipal * (input.interestRate / 100) * (input.tenureMonths / 12),
  );
  const totalPayable = round(financedPrincipal + totalInterestAmount);
  const installmentAmount = round(totalPayable / input.tenureMonths);
  return { financedPrincipal, totalInterestAmount, totalPayable, installmentAmount };
}

export interface ScheduleItemInput {
  installmentNumber: number;
  dueDate: string;
  principalPortion: number;
  interestPortion: number;
  amountDue: number;
}

/** Generates the per-month schedule: equal installments, due on the same day-of-month as
 * `purchaseDate` (clamped), with the LAST installment absorbing any rounding remainder so the sum
 * of every `amountDue` exactly equals `terms.totalPayable`. */
export function generateInstallmentSchedule(purchaseDate: string, terms: InstallmentTerms, tenureMonths: number): ScheduleItemInput[] {
  const monthlyPrincipal = round(terms.financedPrincipal / tenureMonths);
  const monthlyInterest = round(terms.totalInterestAmount / tenureMonths);

  const items: ScheduleItemInput[] = [];
  let principalAccrued = 0;
  let interestAccrued = 0;
  for (let n = 1; n <= tenureMonths; n++) {
    const isLast = n === tenureMonths;
    const principalPortion = isLast ? round(terms.financedPrincipal - principalAccrued) : monthlyPrincipal;
    const interestPortion = isLast ? round(terms.totalInterestAmount - interestAccrued) : monthlyInterest;
    principalAccrued = round(principalAccrued + principalPortion);
    interestAccrued = round(interestAccrued + interestPortion);
    items.push({
      installmentNumber: n,
      dueDate: addMonthsClamped(purchaseDate, n),
      principalPortion,
      interestPortion,
      amountDue: round(principalPortion + interestPortion),
    });
  }
  return items;
}
