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
import { exportElementToPdf } from '../../lib/pdf-export';
import { DocumentLetterhead, LetterheadCompany } from './DocumentLetterhead';
import { DocumentFooter } from './DocumentFooter';
import { useActiveCompany } from '../../lib/use-active-company';

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
  const [pdfLoading, setPdfLoading] = useState(false);
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

  async function handleDownloadPdf() {
    if (!printRef.current || !q) return;
    setPdfLoading(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName('عرض سعر', q.customer?.name, q.documentNumber),
        'portrait',
      );
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  // The table's row-level طباعة/تصدير PDF buttons navigate here with ?autoprint=1 / ?autopdf=1 so
  // the action happens immediately once the document is loaded, instead of requiring a second click.
  useEffect(() => {
    if (!q) return;
    if (searchParams.get('autoprint') === '1') {
      window.print();
    } else if (searchParams.get('autopdf') === '1') {
      handleDownloadPdf();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div>
      <PageHeader
        title={`${t('nav.quotations')} — ${q?.documentNumber ?? ''}`}
        actions={
          q ? (
            <div className="flex gap-2 print:hidden">
              <Button variant="secondary" onClick={() => window.print()}>
                {t('common.print')}
              </Button>
              <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
                {t('actions.downloadPdf')}
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
