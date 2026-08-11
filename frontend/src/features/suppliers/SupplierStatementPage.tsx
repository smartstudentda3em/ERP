import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount, formatQuantity } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { DocumentLetterhead, LetterheadCompany } from '../sales/DocumentLetterhead';
import { DocumentFooter } from '../sales/DocumentFooter';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';
import { useToast } from '../../components/ui/Toast';

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
  branchId?: string | null;
  quantityPackages: number;
  unitsPerPackage: number;
  totalAmount: number;
  paidAmount: number;
  product?: { nameEn?: string; nameAr?: string };
}

interface SupplierPayment {
  id: string;
  documentNumber: string;
  paymentDate: string;
  purchaseReceiptId?: string | null;
  amount: number;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

/** A single row in the "سندات الدفع" table — either a real SupplierPayment voucher, or a legacy
 * row synthesized from a receipt's own paidAmount (money settled at receipt creation, before this
 * feature existed — see the paymentVoucherRows comment below for why the two never double-count). */
interface VoucherRow {
  id: string;
  documentNumber: string;
  date: string;
  amount: number;
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
  const { isPrintingPress } = useActiveCompany();
  const toast = useToast();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('0');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payBranchId, setPayBranchId] = useState('');
  const [payNotes, setPayNotes] = useState('');

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

  const supplierPaymentsQuery = useQuery({
    queryKey: ['supplier-payments', companyId, id],
    queryFn: () =>
      unwrap<SupplierPayment[]>(apiClient.get('/supplier-payments', { params: { companyId, supplierId: id } })),
    enabled: !!companyId && !!id,
  });

  // Press-only — the general "دفع المتبقي" modal below needs a branch to attribute the payment
  // to, same required-select pattern as SalesPaymentsPage's own general (not-tied-to-invoice)
  // payment form, since there is no "active branch" concept to derive it from automatically.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && payOpen && !!companyId,
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

  const datedPayments = useMemo(
    () => (supplierPaymentsQuery.data ?? []).filter((p) => inDateRange(p.paymentDate, dateRange)),
    [supplierPaymentsQuery.data, dateRange],
  );
  // Only receipts still in scope (respects scope=pending) may show a payment tied to them —
  // matches scopedReceipts' own filtering so a fully-settled receipt's old payment doesn't
  // reappear in the "مستحقات معلقة" view.
  const scopedReceiptIds = useMemo(() => new Set(scopedReceipts.map((r) => r.id)), [scopedReceipts]);
  const inScopePayments = useMemo(
    () => datedPayments.filter((p) => !p.purchaseReceiptId || scopedReceiptIds.has(p.purchaseReceiptId)),
    [datedPayments, scopedReceiptIds],
  );
  // Real payments recorded against a specific receipt (the per-row "دفع المتبقي" action on
  // PurchasingPage.tsx) already increment that receipt's own paidAmount — summed here so the
  // legacy row below can subtract them back out and show only the portion paid at receipt
  // creation, avoiding counting (and displaying) the same money twice.
  const tiedAmountByReceipt = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of inScopePayments) {
      if (!p.purchaseReceiptId) continue;
      map.set(p.purchaseReceiptId, (map.get(p.purchaseReceiptId) ?? 0) + Number(p.amount));
    }
    return map;
  }, [inScopePayments]);
  const legacyVoucherRows: VoucherRow[] = useMemo(
    () =>
      scopedReceipts
        .map((r) => ({
          id: `receipt-${r.id}`,
          documentNumber: r.documentNumber,
          date: r.receiptDate,
          amount: Number(r.paidAmount ?? 0) - (tiedAmountByReceipt.get(r.id) ?? 0),
        }))
        .filter((row) => row.amount > 0),
    [scopedReceipts, tiedAmountByReceipt],
  );
  // A "payment voucher" is either a real SupplierPayment record (general, or tied to one receipt)
  // or a legacy row synthesized from money paid at receipt creation, before this feature existed.
  const paymentRows: VoucherRow[] = useMemo(
    () =>
      [
        ...legacyVoucherRows,
        ...inScopePayments.map((p) => ({
          id: p.id,
          documentNumber: p.documentNumber,
          date: p.paymentDate,
          amount: Number(p.amount),
        })),
      ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [legacyVoucherRows, inScopePayments],
  );
  const totalPayments = useMemo(() => paymentRows.reduce((sum, r) => sum + r.amount, 0), [paymentRows]);
  const totalOutstanding = totalPurchases - totalPayments;

  const payMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/supplier-payments', {
        paymentDate: localToday(),
        supplierId: id,
        companyId,
        method: payMethod,
        amount: Number(payAmount),
        notes: payNotes || undefined,
        branchId: isPrintingPress ? payBranchId || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-receipts', companyId] });
      queryClient.invalidateQueries({ queryKey: ['supplier-payments', companyId, id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent-tx'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      setPayOpen(false);
      setPayAmount('0');
      setPayMethod('CASH');
      setPayBranchId('');
      setPayNotes('');
      toast.success(t('suppliers.paymentSavedSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

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
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName(isPendingOnly ? 'كشف مستحقات' : 'كشف حساب', supplier.companyName, localToday()),
        'portrait',
      );
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
      accessor: (r) => `${formatAmount(r.quantityPackages)} × ${formatQuantity(r.unitsPerPackage)}`,
      align: 'right',
    },
    { header: t('fields.totalAmount'), accessor: (r) => money(r.totalAmount), align: 'right' },
  ];

  const paymentColumns: Column<VoucherRow>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('fields.paidAmount'), accessor: (r) => money(r.amount), align: 'right' },
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
            <Button variant="secondary" onClick={handleDownloadStatementPdf} loading={pdfLoading}>
              {t('suppliers.exportStatementPdf')}
            </Button>
            {totalOutstanding > 0 && (
              <Button
                onClick={() => {
                  setPayAmount(String(totalOutstanding));
                  setPayOpen(true);
                }}
              >
                {t('suppliers.payOutstanding')}
              </Button>
            )}
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
        {/* pageSize forced to the full array length so print/PDF captures every row, not just
            the current on-screen page. */}
        <DataTable
          columns={invoiceColumns}
          data={scopedReceipts}
          keyField={(r) => r.id}
          isLoading={receiptsQuery.isLoading}
          searchable={false}
          pageSize={Math.max(scopedReceipts.length, 1)}
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
          isLoading={receiptsQuery.isLoading || supplierPaymentsQuery.isLoading}
          searchable={false}
          pageSize={Math.max(paymentRows.length, 1)}
        />

        <DocumentFooter />
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t('suppliers.payOutstanding')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            payMutation.mutate();
          }}
        >
          <FormField label={t('common.name')}>
            <Input disabled value={supplier?.companyName ?? '—'} />
          </FormField>
          <FormField label={t('fields.amount')}>
            <Input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </FormField>
          <FormField label={t('fields.method')}>
            {/* Every company's supplier payout offers exactly two options — نقدي debits the Cash
                treasury, تحويل بنكي debits the Bank balance (see SupplierPaymentsService.resolveAccount).
                شيك/بطاقة/دفع إلكتروني don't apply to a supplier payout here, so they're dropped entirely. */}
            <Select required value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="CASH">{t('paymentMethod.CASH')}</option>
              <option value="BANK_TRANSFER">{t('paymentMethod.BANK_TRANSFER')}</option>
            </Select>
          </FormField>
          {isPrintingPress && (
            <FormField label={t('fields.branch')} required>
              <Select required value={payBranchId} onChange={(e) => setPayBranchId(e.target.value)}>
                <option value="">—</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={payMutation.isPending || (isPrintingPress && !payBranchId)}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
