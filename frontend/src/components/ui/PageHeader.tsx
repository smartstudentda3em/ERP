import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <h1 className="text-xl font-semibold">{title}</h1>
      {/* flex-wrap here too (not just the outer row) — a page with several action buttons (print/
          PDF/WhatsApp/record payment, etc.) would otherwise force horizontal overflow on a phone
          instead of wrapping onto a second line. */}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-12 text-center">
      <div className="text-3xl">🚧</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-[var(--text-muted)]">{t('common.comingSoon')}</p>
    </div>
  );
}
