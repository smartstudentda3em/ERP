/**
 * Characters invalid on Windows filesystems (also unsafe for mobile downloads) — stripped so a
 * generated filename works unmodified everywhere, without the user needing to rename it.
 */
const UNSAFE_FILENAME_CHARS = /[/\\?%*:|"<>]/g;

/**
 * Builds a descriptive, filesystem-safe PDF filename: "[نوع المستند] - [الجهة] - [الرقم].pdf" —
 * e.g. "فاتورة بيع - شركة الأمل - INV-001.pdf" — so downloads are identifiable and searchable on
 * disk instead of a random/generic name. `entityName` falls back to "عام" when unavailable (e.g.
 * a report with no single customer/supplier attached).
 */
export function buildPdfFileName(
  docType: string,
  entityName: string | null | undefined,
  docNumber: string | number,
): string {
  const clean = (s: string) => s.trim().replace(UNSAFE_FILENAME_CHARS, '');
  const entity = entityName?.trim() ? clean(entityName) : 'عام';
  return `${clean(docType)} - ${entity} - ${clean(String(docNumber))}.pdf`;
}
