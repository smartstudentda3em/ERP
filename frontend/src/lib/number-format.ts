/**
 * The single formatter every screen uses to display a numeric amount: whole numbers drop their
 * decimal places entirely (560.00 → "560"), genuine fractions keep up to two decimal digits
 * trimmed of trailing zeros (12.50 → "12.5"), and exactly zero is shown as "0.00" rather than "0"
 * so an empty/zero cell still reads as a deliberate amount, not missing data.
 *
 * Locale is pinned to 'en-US' rather than left to the browser default — an Arabic OS/browser
 * locale would otherwise render Arabic-Indic digits (١٢٣) via a bare toLocaleString(), breaking
 * the Latin-digit convention every table in this app relies on.
 */
export function formatAmount(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0.00';
  if (Number.isInteger(num)) return num.toLocaleString('en-US');
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Rounds to `decimals` places (2 by default, matching formatAmount's own precision — this
 * codebase has no per-currency decimal-places setting to vary it by). Used for reverse-calculated
 * values (e.g. unit price derived from an edited line total) so they don't carry long floating-point
 * tails into a field the user then re-edits. */
export function roundTo(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
