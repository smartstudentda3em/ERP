import { Fragment, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { DocumentLetterhead, LetterheadCompany } from '../sales/DocumentLetterhead';
import { DocumentFooter } from '../sales/DocumentFooter';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';

interface Customer {
  id: string;
  name: string;
  mobile?: string;
}

interface Company extends LetterheadCompany {
  id: string;
}

interface InvoiceLine {
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface OutstandingInvoice {
  id: string;
  documentNumber: string;
  invoiceDate: string;
  grandTotal: number;
  amountPaid: number;
  remainingAmount: number;
  salesRepresentativeName?: string | null;
  lines?: InvoiceLine[];
}

interface Receipt {
  id: string;
  documentNumber: string;
  paymentDate: string;
  amount: number;
  method: string;
  notes?: string | null;
}

function money(n: number): string {
  return formatAmount(n);
}

/**
 * A full account statement — every invoice for the customer (paid, partially paid, or unpaid) is
 * listed, with a separate receipts table underneath showing every payment voucher actually
 * collected, so the page reads like a real customer statement rather than only open debt.
 */
export function OutstandingBalanceDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Tailwind's print:hidden only kicks in for real browser printing (@media print) — it has no
  // effect on html2canvas, which snapshots whatever's actually on screen. This state is the PDF
  // export's equivalent: toggled true just before capture so action buttons vanish from both.
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: !!companyId,
  });
  const customer = useMemo(() => customersQuery.data?.find((c) => c.id === id), [customersQuery.data, id]);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  // Every invoice for the customer regardless of payment status — paid, partially paid, or unpaid.
  const invoicesQuery = useQuery({
    queryKey: ['customer-invoices', id],
    queryFn: () => unwrap<OutstandingInvoice[]>(apiClient.get(`/customers/${id}/invoices`)),
    enabled: !!id,
  });
  const invoices = invoicesQuery.data ?? [];

  const receiptsQuery = useQuery({
    queryKey: ['customer-receipts', id, companyId],
    queryFn: () => unwrap<Receipt[]>(apiClient.get('/sales/payments', { params: { customerId: id, companyId } })),
    enabled: !!id,
  });

  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  const dateFilteredInvoices = useMemo(
    () => invoices.filter((i) => inDateRange(i.invoiceDate, dateRange)),
    [invoices, dateRange],
  );

  // إجمالي الفواتير: sum of grandTotal across every invoice in the period.
  const totalInvoiced = useMemo(
    () => dateFilteredInvoices.reduce((sum, i) => sum + Number(i.grandTotal ?? 0), 0),
    [dateFilteredInvoices],
  );
  const receipts = receiptsQuery.data ?? [];
  const dateFilteredReceipts = useMemo(
    () => receipts.filter((r) => inDateRange(r.paymentDate, dateRange)),
    [receipts, dateRange],
  );
  // إجمالي المقبوضات: sum of the actual receipt vouchers — the single source of truth for "money
  // collected," used identically for the top summary card and the heading above the receipts table
  // below, so the two can never disagree. (Previously the top card summed each invoice's
  // amountPaid instead, which undercounts on-account receipts not yet linked to a specific invoice
  // — e.g. a "دفعة تحت الحساب" payment — so it showed a smaller total than the receipts table's
  // real sum.)
  const receiptsTotal = useMemo(
    () => dateFilteredReceipts.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    [dateFilteredReceipts],
  );
  // الرصيد المستحق = إجمالي الفواتير - إجمالي المقبوضات، وليس مجموع عمود "المتبقي" لكل فاتورة:
  // ذلك المجموع يستبعد أي سند قبض غير مرتبط بفاتورة محددة (سند "دفعة تحت الحساب") لأن remainingAmount
  // لكل فاتورة يُحسب فقط من السندات المرتبطة بها مباشرة — فيظهر أعلى من الرصيد الحقيقي المستحق على
  // العميل. الطرح المباشر من نفس رقمي البطاقتين أعلاه هو مقياس الرصيد الحقيقي (يطابق
  // buildCustomerOutstandingTotal المستخدم في شاشة الشركاء)، ويتحدّث تلقائياً مع أي تصفية بالتاريخ.
  const totalOutstanding = useMemo(
    () => totalInvoiced - receiptsTotal,
    [totalInvoiced, receiptsTotal],
  );

  // The table also gets its own free-text search box (DataTable's built-in one is disabled below)
  // narrowing further on top of the date range, so its total badge always matches exactly what's
  // displayed in the table.
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const filteredInvoices = useMemo(() => {
    const q = invoiceSearch.trim().toLowerCase();
    if (!q) return dateFilteredInvoices;
    return dateFilteredInvoices.filter(
      (r) =>
        r.documentNumber.toLowerCase().includes(q) ||
        (r.salesRepresentativeName ?? '').toLowerCase().includes(q),
    );
  }, [dateFilteredInvoices, invoiceSearch]);
  const filteredInvoicesTotal = useMemo(
    () => filteredInvoices.reduce((sum, i) => sum + Number(i.grandTotal ?? 0), 0),
    [filteredInvoices],
  );

  // Expand-in-place row detail (بند 4: توسيع السطر) — lines already ride along on every invoice
  // returned by GET /customers/:id/invoices, so no extra fetch is needed on expand.
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null);

  const periodLabel =
    dateRange.from || dateRange.to
      ? `${dateRange.from || '…'} → ${dateRange.to || '…'}`
      : t('customers.allPeriods');

  async function handleDownloadStatementPdf() {
    if (!printRef.current || !customer) return;
    setPdfLoading(true);
    setIsExportingPdf(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      pdf.save(buildPdfFileName('كشف حساب', customer.name, localToday()));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setIsExportingPdf(false);
      setPdfLoading(false);
    }
  }

  function toggleExpanded(invoiceId: string) {
    setExpandedInvoiceId((current) => (current === invoiceId ? null : invoiceId));
  }

  const receiptColumns: Column<Receipt>[] = [
    { header: t('customers.receiptNumber'), accessor: (r) => r.documentNumber },
    { header: t('customers.receiptDate'), accessor: (r) => r.paymentDate },
    { header: t('fields.amount'), accessor: (r) => money(r.amount), align: 'right' },
    {
      header: t('customers.paymentMethodOrNotes'),
      accessor: (r) => `${t(`paymentMethod.${r.method}`, r.method)}${r.notes ? ` — ${r.notes}` : ''}`,
    },
    {
      header: t('common.actions'),
      accessor: (r) =>
        !isExportingPdf && (
          <div className="flex justify-center print:hidden">
            <Button type="button" variant="secondary" onClick={() => navigate(`/sales/payments?customerId=${id}`)}>
              {t('common.viewDetails')}
            </Button>
          </div>
        ),
      align: 'center',
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.customerAccount')}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              {t('customers.printStatement')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadStatementPdf} disabled={pdfLoading}>
              {t('customers.exportStatementPdf')}
            </Button>
          </div>
        }
      />

      <div ref={printRef} className="printable-document">
        <DocumentLetterhead
          docTypeLabel={t('printDocument.statementTitle')}
          metaLine={`${t('common.name')}: ${customer?.name ?? '—'}  |  ${t('customers.statementPeriod')}: ${periodLabel}`}
          company={company}
        />

        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('common.name')}</div>
              <div className="mt-1 text-lg font-semibold">{customer?.name ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('fields.mobile')}</div>
              <div className="mt-1 text-lg font-semibold">{customer?.mobile ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('customers.statementPeriod')}</div>
              <div className="mt-1 text-lg font-semibold">{periodLabel}</div>
            </div>
          </div>
        </Card>

        {!isExportingPdf && (
          <div className="mb-4 print:hidden">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>
        )}

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('customers.totalInvoicesLabel')}</div>
            <div className="mt-1 text-lg font-semibold">{money(totalInvoiced)}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('customers.totalReceiptsLabel')}</div>
            <div className="mt-1 text-lg font-semibold">{money(receiptsTotal)}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('actions.balanceDue')}</div>
            <div className="mt-1 text-lg font-semibold text-red-600">{money(totalOutstanding)}</div>
          </Card>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          {!isExportingPdf && (
            <Input
              type="search"
              placeholder={t('common.search') ?? ''}
              className="max-w-xs print:hidden"
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
            />
          )}
          <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
            {t('customers.totalInvoicesLabel')}: <span className="font-semibold">{money(filteredInvoicesTotal)}</span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="app-table">
            <thead>
              <tr>
                <th className="w-8" />
                <th>{t('table.documentNumber')}</th>
                <th>{t('customers.invoiceDate')}</th>
                <th>{t('fields.invoiceOwner')}</th>
                <th>{t('fields.grandTotal')}</th>
                <th>{t('fields.paidAmount')}</th>
                <th>{t('fields.remainingAmount')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invoicesQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="text-[var(--text-muted)]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-[var(--text-muted)]">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((r) => {
                  const expanded = expandedInvoiceId === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className="cursor-pointer" onClick={() => toggleExpanded(r.id)}>
                        <td className="print:hidden">
                          <span className="inline-block text-[var(--text-muted)]">{expanded ? '▾' : '›'}</span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="text-primary-600 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/sales/invoices/${r.id}`);
                            }}
                          >
                            {r.documentNumber}
                          </button>
                        </td>
                        <td>{r.invoiceDate}</td>
                        <td>{r.salesRepresentativeName ?? '—'}</td>
                        <td>{money(r.grandTotal)}</td>
                        <td>{money(r.amountPaid)}</td>
                        <td>{money(r.remainingAmount)}</td>
                        <td>
                          {!isExportingPdf && r.remainingAmount > 0.005 && (
                            <div className="flex justify-center print:hidden">
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(
                                    `/sales/payments?customerId=${id}&invoiceId=${r.id}&amount=${r.remainingAmount}`,
                                  );
                                }}
                              >
                                {t('actions.collectPayment')}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={8} className="bg-[var(--table-header-bg)] p-3">
                            {r.lines && r.lines.length > 0 ? (
                              <table className="app-table">
                                <thead>
                                  <tr>
                                    <th>{t('fields.product')}</th>
                                    <th>{t('fields.quantity')}</th>
                                    <th>{t('fields.unitPrice')}</th>
                                    <th>{t('common.total')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.lines.map((l, i) => (
                                    <tr key={i}>
                                      <td>{l.productName}</td>
                                      <td>{money(l.quantity)}</td>
                                      <td>{money(l.unitPrice)}</td>
                                      <td>{money(l.lineTotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="text-sm text-[var(--text-muted)]">{t('common.noData')}</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold">{t('customers.receiptsHistory')}</div>
          <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
            {t('customers.totalReceiptsLabel')}: <span className="font-semibold">{money(receiptsTotal)}</span>
          </div>
        </div>
        <DataTable
          columns={receiptColumns}
          data={dateFilteredReceipts}
          keyField={(r) => r.id}
          isLoading={receiptsQuery.isLoading}
          searchable={false}
        />

        <DocumentFooter />
      </div>
    </div>
  );
}
