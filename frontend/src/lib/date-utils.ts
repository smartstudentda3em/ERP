/**
 * Returns today's date in the browser's local calendar, as YYYY-MM-DD.
 *
 * `new Date().toISOString().slice(0, 10)` returns the UTC calendar date, which is the wrong
 * calendar day for part of the day in any positive-UTC-offset timezone (e.g. UTC+3): a document
 * created at 1am local time would silently default to yesterday's date.
 */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const AR_MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
const EN_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-10-04" -> "2026-10" — the grouping key an audit's month filter/column both key off. */
export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** 8 -> "أغسطس" / "August" — the bare month name, for pickers where the year is a separate field. */
export function monthNameOnly(month: number, language: string): string {
  const names = language.startsWith('ar') ? AR_MONTH_NAMES : EN_MONTH_NAMES;
  return names[month - 1] ?? String(month);
}

/** "2026-10" -> "أكتوبر 2026" / "October 2026" — mirrors partners.q1-4's month-name spellings. */
export function monthNameOf(monthKey: string, language: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${monthNameOnly(month, language)} ${year}`;
}
