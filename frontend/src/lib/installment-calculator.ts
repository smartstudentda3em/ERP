/** Mirrors backend/src/common/utils/installment-calculator.ts exactly — used for the create
 * form's live schedule preview, computed client-side before the server ever sees the request. */

const round = (n: number) => Math.round(n * 10000) / 10000;

export function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export interface InstallmentTerms {
  financedPrincipal: number;
  totalInterestAmount: number;
  totalPayable: number;
  installmentAmount: number;
}

export function computeInstallmentTerms(
  totalPrice: number,
  downPayment: number,
  interestType: 'MONTHLY' | 'YEARLY',
  interestRate: number,
  tenureMonths: number,
): InstallmentTerms {
  const financedPrincipal = round(totalPrice - downPayment);
  const totalInterestAmount = round(
    interestType === 'MONTHLY'
      ? financedPrincipal * (interestRate / 100) * tenureMonths
      : financedPrincipal * (interestRate / 100) * (tenureMonths / 12),
  );
  const totalPayable = round(financedPrincipal + totalInterestAmount);
  const installmentAmount = tenureMonths > 0 ? round(totalPayable / tenureMonths) : 0;
  return { financedPrincipal, totalInterestAmount, totalPayable, installmentAmount };
}

export interface ScheduleItemPreview {
  installmentNumber: number;
  dueDate: string;
  principalPortion: number;
  interestPortion: number;
  amountDue: number;
}

export function generateInstallmentSchedule(
  purchaseDate: string,
  terms: InstallmentTerms,
  tenureMonths: number,
): ScheduleItemPreview[] {
  if (tenureMonths <= 0) return [];
  const monthlyPrincipal = round(terms.financedPrincipal / tenureMonths);
  const monthlyInterest = round(terms.totalInterestAmount / tenureMonths);
  const items: ScheduleItemPreview[] = [];
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
