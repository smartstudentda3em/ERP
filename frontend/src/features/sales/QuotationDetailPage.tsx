import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, statusColor } from '../../components/ui/Badge';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdfBlob } from '../../lib/pdf-export';
import { DocumentLetterhead, LetterheadCompany } from './DocumentLetterhead';
import { DocumentFooter } from './DocumentFooter';
import { useActiveCompany, useIsSalesRep, useIsBranchManager } from '../../lib/use-active-company';
import { useToast } from '../../components/ui/Toast';

interface QuotationLine {
  id: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  product: {
    nameEn: string;
    sku: string;
    unit?: { nameEn: string } | null;
  };
}

interface Quotation {
  id: string;
  documentNumber: string;
  quotationDate: string;
  validUntil: string | null;
  status: string;
  subtotal: number;
  grandTotal: number;
  companyId: string;
  customer: { name: string; mobile?: string };
  salesRepresentative: { name: string } | null;
  lines: QuotationLine[];
}

interface Company extends LetterheadCompany {
  id: string;
}

function money(n: number): string {
  return formatAmount(n);
}

export function QuotationDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const toast = useToast();
  // Same as the invoice detail page: no printer attached to a phone, so مندوب/مدير فرع never get a
  // "طباعة" button here — Print stays for every other role, on desktop.
  const isMobileRestrictedRole = useIsSalesRep() || useIsBranchManager();
  const [shareLoading, setShareLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const quotationQuery = useQuery({
    queryKey: ['quotation', id],
    queryFn: () => unwrap<Quotation>(apiClient.get(`/sales/quotations/${id}`)),
    enabled: !!id,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });

  const q = quotationQuery.data;
  const company =
    companiesQuery.data?.find((c) => c.id === (q?.companyId ?? companyId)) ?? companiesQuery.data?.[0];

  // Same share-with-download-fallback flow as the invoice detail page: hand the PDF straight to
  // the OS share sheet, and only fall back to a plain download when the browser has no file-sharing
  // support (or the share attempt itself fails) — reusing the already-captured blob instead of
  // re-running html2canvas a second time.
  async function handleShareQuotation() {
    if (!printRef.current || !q) return;
    setShareLoading(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      const filename = buildPdfFileName('عرض سعر', q.customer?.name, q.documentNumber);
      const blob = await exportElementToPdfBlob(printRef.current, 'portrait');
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (err: any) {
          // AbortError = user closed the share sheet without picking anything, leave it at that.
          // Any other failure (e.g. a real device throwing NotAllowedError because the async PDF
          // capture above pushed the share call outside the browser's "user gesture" window) falls
          // through to the download below instead of showing an error.
          if (err?.name === 'AbortError') return;
        }
      }

      // No native share support (or the attempt above failed) — tries opening it as a normal page
      // view first: browsers generally render a PDF viewed this way in their own built-in viewer
      // (with its own share/print icons) with no extra prompt, whereas an explicit <a download>
      // forces a "save this file?" confirmation on some mobile browsers (Samsung Internet in
      // particular). window.open() can come back null if a popup blocker steps in — since this call
      // is already several `await`s removed from the original click, that's a real possibility here
      // — so this only falls back to the guaranteed-working forced download when the view attempt
      // didn't open.
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, '_blank');
      if (!opened) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.warning(t('actions.shareNotSupported'));
    } catch (err) {
      toast.error(t('common.saveFailed'));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setShareLoading(false);
    }
  }

  // The table's row-level طباعة/مشاركة buttons navigate here with ?autoprint=1 / ?autopdf=1 so the
  // action happens immediately once the document is loaded, instead of requiring a second click.
  useEffect(() => {
    if (!q) return;
    if (searchParams.get('autoprint') === '1' && !isMobileRestrictedRole) {
      window.print();
    } else if (searchParams.get('autopdf') === '1') {
      handleShareQuotation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div>
      <PageHeader
        title={`${t('nav.quotations')} — ${q?.documentNumber ?? ''}`}
        actions={
          q ? (
            <div className="flex flex-wrap gap-2 print:hidden">
              {!isMobileRestrictedRole && (
                <Button variant="secondary" onClick={() => window.print()}>
                  {t('common.print')}
                </Button>
              )}
              <Button variant="secondary" onClick={handleShareQuotation} loading={shareLoading}>
                {t('actions.shareInvoice')}
              </Button>
            </div>
          ) : undefined
        }
      />

      {q && (
        <div ref={printRef} className="printable-document">
          <DocumentLetterhead
            docTypeLabel={t('printDocument.quotationTitle')}
            metaLine={`${t('printDocument.quotationNumberLabel')}: ${q.documentNumber}  |  ${t('common.date')}: ${q.quotationDate}`}
            company={company}
          />

          <div className="mb-4 flex justify-end">
            <Badge color={statusColor(q.status)}>{t(`docStatus.${q.status}`, q.status)}</Badge>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('nav.customers')}</div>
              <div className="font-medium">{q.customer.name}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">
                {t(isPrintingPress ? 'fields.salesRepresentativePress' : 'fields.salesRepresentative')}
              </div>
              <div className="font-medium">{q.salesRepresentative?.name ?? '—'}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('customers.invoiceDate')}</div>
              <div className="font-medium">{q.quotationDate}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('common.total')}</div>
              <div className="font-medium">{money(q.grandTotal)}</div>
            </Card>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>{t('fields.product')}</th>
                    <th>{t('fields.quantity')}</th>
                    <th>{t('fields.unit')}</th>
                    <th>{t('fields.unitPrice')}</th>
                    <th>{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {q.lines.map((l, i) => (
                    <tr key={l.id ?? i}>
                      <td>
                        <bdi dir="ltr">
                          {l.product.sku} — {l.product.nameEn}
                        </bdi>
                      </td>
                      <td>{money(l.quantity)}</td>
                      <td className="text-[var(--text-muted)]">
                        <bdi dir="ltr">{l.product.unit?.nameEn}</bdi>
                      </td>
                      <td>{money(l.unitPrice)}</td>
                      <td>{money(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 ms-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t('fields.subtotal')}</span>
                <span>{money(q.subtotal)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>{t('common.total')}</span>
                <span>{money(q.grandTotal)}</span>
              </div>
            </div>
          </Card>

          <DocumentFooter />
        </div>
      )}
    </div>
  );
}
