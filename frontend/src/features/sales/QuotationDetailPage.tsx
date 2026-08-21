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
import { shareEngineHint, shareCapabilityHint } from '../../lib/browser-info';
import { uploadSharedPdf } from '../../lib/shared-document';
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
      // The off-screen/fixed-width positioning is only needed while html2canvas is actively
      // reading the DOM above — leaving it on for the rest of this function (a share sheet, or an
      // upload that can take several seconds on a slow connection) made the whole page appear to
      // go blank and hang, with nothing on screen to show it was still working.
      printRef.current.classList.remove('pdf-export-mode');
      const file = new File([blob], filename, { type: 'application/pdf' });

      // 1. Best case: this browser can share the PDF itself as an attached file.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (err: any) {
          // AbortError = user closed the share sheet without picking anything, leave it at that.
          // Any other failure falls through to the next tier instead of showing an error.
          if (err?.name === 'AbortError') return;
        }
      }

      // 2. Confirmed real-world case (Samsung Internet hosting an installed TWA): the browser
      // can't share a file at all, but CAN share a plain link (Level 1 Web Share — much more
      // broadly supported than Level 2 file sharing). Upload the already-captured PDF so it has a
      // real public URL, then share that link instead of the file itself.
      const canShareUrl = navigator.canShare ? navigator.canShare({ url: window.location.origin }) : !!navigator.share;
      let step2ErrorDetail = '';
      if (canShareUrl) {
        try {
          const sharedUrl = await uploadSharedPdf(blob, filename);
          await navigator.share({ title: filename, url: sharedUrl });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
          // Upload failure or share-of-a-link failure — falls through to the plain download below.
          // Recorded (temporarily) for the diagnostic toast: distinguishes "the upload request
          // itself failed" (name/message from axios — a network error, a timeout, a 4xx/5xx status
          // in err.response.status) from "the link upload worked but navigator.share(url) itself
          // then failed" (name/message from the Web Share API).
          const status = err?.response?.status;
          step2ErrorDetail = `${err?.name || 'Error'}${status ? ` ${status}` : ''}: ${String(err?.message || '').slice(0, 80)}`;
        }
      }

      // 3. Last resort — neither file nor link sharing worked (or navigator.share doesn't exist at
      // all). Reuses the blob already captured instead of re-running html2canvas. This app runs
      // inside an installed TWA (a single-activity Android wrapper, not a normal tabbed browser) on
      // the phones that actually hit this path, and window.open()-based "view it first" attempts
      // were tried and abandoned here — one threw outright, the other silently opened a window with
      // no visible content, since a TWA has nowhere to render a second window/tab. The browser's
      // own "save file?" confirmation (unavoidable — no page can suppress it) is the trade-off for
      // a path that reliably puts the file on the device at all.
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      const diagnosticSuffix = step2ErrorDetail ? `, ${step2ErrorDetail}` : '';
      toast.warning(`${t('actions.shareNotSupported')} (${shareEngineHint()}, ${shareCapabilityHint()}${diagnosticSuffix})`);
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
