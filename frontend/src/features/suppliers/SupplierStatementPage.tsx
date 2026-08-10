import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { DocumentLetterhead, LetterheadCompany } from '../sales/DocumentLetterhead';
import { DocumentFooter } from '../sales/DocumentFooter';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';

interface Currency {
  id: string;
  code: string;
  symbol?: string | null;
}

interface Supplier {
  id: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  currency: Currency | null;
}

interface Company extends LetterheadCompany {
  id: string;
}

interface PurchaseReceipt {
  id: string;
  documentNumber: string;
  receiptDate: string;
  supplierId: string;
  quantityPackages: number;
  unitsPerPackage: number;
  totalAmount: number;
  paidAmount: number;
  product?: { nameEn?: string; nameAr?: string };
}

function money(n: number): string {
  return formatAmount(n);
}

/**
 * A supplier account statement (Printing Press only — the "إجمالي المشتريات"/"المتبقي كمستحق
 * للمورد" links in SuppliersTab.tsx are the sole entry points, see that file for why nothing
 * changes for any other company): every purchase receipt for this supplier with its own total,
 * plus a payment-vouchers table underneath listing only the receipts a payment was actually
 * recorded on (paidAmount > 0) — there is currently no way to record a supplier payment
 * independent of a receipt, so this is the complete picture of money paid, not a subset of it.
 *
 * `?scope=pending` (driven by the "المتبقي كمستحق للمورد" link) narrows both tables to only
 * unpaid/partially-paid receipts (paidAmount < totalAmount), excluding anything already settled
 * in full — everything else on the page (fetching, totals, print/PDF) is identical either way.
 */
export function SupplierStatementPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const isPendingOnly = searchParams.get('scope') === 'pending';
  const { t } = useTranslation();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<Supplier[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: !!companyId,
  });
  const supplier = useMemo(() => suppliersQuery.data?.find((s) => s.id === id), [suppliersQuery.data, id]);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  // Same endpoint PurchasingPage/SuppliersTab already use — it returns every receipt for the
  // company (no supplierId filter server-side), so narrowing to this one supplier happens here.
  const receiptsQuery = useQuery({
    queryKey: ['purchase-receipts', companyId],
    queryFn: () => unwrap<PurchaseReceipt[]>(apiClient.get('/inventory/purchase-receipts', { params: { companyId } })),
    enabled: !!companyId,
  });

  const supplierReceipts = useMemo(
    () => (receiptsQuery.data ?? []).filter((r) => r.supplierId === id),
    [receiptsQuery.data, id],
  );
  const dateFilteredReceipts = useMemo(
    () => supplierReceipts.filter((r) => inDateRange(r.receiptDate, dateRange)),
    [supplierReceipts, dateRange],
  );
  // scope=pending excludes anything already paid in full — the "الفواتير المستحقة" view only
  // ever needs to show unpaid/partially-paid receipts.
  const scopedReceipts = useMemo(
    () =>
      isPendingOnly
        ? dateFilteredReceipts.filter((r) => Number(r.paidAmount ?? 0) < Number(r.totalAmount ?? 0))
        : dateFilteredReceipts,
    [dateFilteredReceipts, isPendingOnly],
  );
  const totalPurchases = useMemo(
    () => scopedReceipts.reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0),
    [scopedReceipts],
  );

  // A "payment voucher" is a receipt an actual payment was recorded against — a fully-credit
  // (آجل) receipt with paidAmount 0 has no voucher to show here.
  const paymentRows = useMemo(
    () => scopedReceipts.filter((r) => Number(r.paidAmount ?? 0) > 0),
    [scopedReceipts],
  );
  const totalPayments = useMemo(
    () => paymentRows.reduce((sum, r) => sum + Number(r.paidAmount ?? 0), 0),
    [paymentRows],
  );
  const totalOutstanding = totalPurchases - totalPayments;

  const periodLabel =
    dateRange.from || dateRange.to
      ? `${dateRange.from || '…'} → ${dateRange.to || '…'}`
      : t('customers.allPeriods');

  async function handleDownloadStatementPdf() {
    if (!printRef.current || !supplier) return;
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
      pdf.save(buildPdfFileName(isPendingOnly ? 'كشف مستحقات' : 'كشف حساب', supplier.companyName, localToday()));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setIsExportingPdf(false);
      setPdfLoading(false);
    }
  }

  const invoiceColumns: Column<PurchaseReceipt>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.receiptDate },
    { header: t('fields.product'), accessor: (r) => r.product?.nameEn ?? '—' },
    {
      header: t('fields.quantityPackages'),
      accessor: (r) => `${formatAmount(r.quantityPackages)} × ${formatAmount(r.unitsPerPackage)}`,
      align: 'right',
    },
    { header: t('fields.totalAmount'), accessor: (r) => money(r.totalAmount), align: 'right' },
  ];

  const paymentColumns: Column<PurchaseReceipt>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.receiptDate },
    { header: t('fields.paidAmount'), accessor: (r) => money(r.paidAmount), align: 'right' },
  ];

  return (
    <div>
      <PageHeader
        title={t(isPendingOnly ? 'suppliers.pendingStatementTitle' : 'suppliers.statementTitle')}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()}>
              {t('suppliers.printStatement')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadStatementPdf} disabled={pdfLoading}>
              {t('suppliers.exportStatementPdf')}
            </Button>
          </div>
        }
      />

      <div ref={printRef} className="printable-document">
        <DocumentLetterhead
          docTypeLabel={t(
            isPendingOnly ? 'printDocument.supplierPendingStatementTitle' : 'printDocument.supplierStatementTitle',
          )}
          metaLine={`${t('common.name')}: ${supplier?.companyName ?? '—'}  |  ${t('customers.statementPeriod')}: ${periodLabel}`}
          company={company}
        />

        <Card className="mb-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('common.name')}</div>
              <div className="mt-1 text-lg font-semibold">{supplier?.companyName ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('fields.phone')}</div>
              <div className="mt-1 text-lg font-semibold">{supplier?.phone ?? '—'}</div>
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
            <div className="text-xs text-[var(--text-muted)]">
              {t(isPendingOnly ? 'suppliers.totalPendingInvoicesLabel' : 'fields.totalPurchases')}
            </div>
            <div className="mt-1 text-lg font-semibold">{money(totalPurchases)}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('suppliers.totalPaymentsLabel')}</div>
            <div className="mt-1 text-lg font-semibold">{money(totalPayments)}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('purchasing.outstandingToSupplier')}</div>
            <div className="mt-1 text-lg font-semibold text-red-600">{money(totalOutstanding)}</div>
          </Card>
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold">
            {t(isPendingOnly ? 'suppliers.pendingInvoicesSection' : 'suppliers.purchaseInvoicesSection')}
          </div>
          <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
            {t(isPendingOnly ? 'suppliers.totalPendingInvoicesLabel' : 'fields.totalPurchases')}:{' '}
            <span className="font-semibold">{money(totalPurchases)}</span>
          </div>
        </div>
        <DataTable
          columns={invoiceColumns}
          data={scopedReceipts}
          keyField={(r) => r.id}
          isLoading={receiptsQuery.isLoading}
          searchable={false}
        />

        <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-lg font-semibold">{t('suppliers.paymentVouchersSection')}</div>
          <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
            {t('suppliers.totalPaymentsLabel')}: <span className="font-semibold">{money(totalPayments)}</span>
          </div>
        </div>
        <DataTable
          columns={paymentColumns}
          data={paymentRows}
          keyField={(r) => r.id}
          isLoading={receiptsQuery.isLoading}
          searchable={false}
        />

        <DocumentFooter />
      </div>
    </div>
  );
}
