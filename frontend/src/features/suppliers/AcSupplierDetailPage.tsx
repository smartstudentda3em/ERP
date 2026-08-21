import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount, formatQuantity } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';

/**
 * Air Conditioning company only — a standalone supplier detail screen, entry point is the
 * supplier's own name in SuppliersTab.tsx's table (AC-gated there). Deliberately self-contained:
 * doesn't import or depend on ImportCargoTab/ShippingTab/ShipmentPaymentsTab or any of their
 * services. /suppliers, /inventory/purchase-receipts and /supplier-payments (read-only here, for
 * historical payments) are generic parties/purchasing resources shared company-wide, not part of
 * the Cargo/Shipping import-tracking feature set, so reusing them here doesn't couple this screen
 * to that system. /ac-supplier-payments and /ac-supplier-tax-payments are new, AC-only, standalone
 * endpoints (ac-supplier-ledger module) with no CashMovementsService/treasury dependency at all —
 * this is where the page's own "+ تسجيل دفعة"/"+ تسجيل ضريبة" actions write. Nothing here is
 * imported by, or affects, any other screen.
 */

type Tab = 'payments' | 'purchases' | 'tax';
type Quarter = 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

interface Supplier {
  id: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
}

interface PurchaseReceipt {
  id: string;
  documentNumber: string;
  receiptDate: string;
  supplierId: string;
  quantityPackages: number;
  unitsPerPackage: number;
  packagePurchasePrice: number;
  totalAmount: number;
  paidAmount: number;
  isFreeGoods?: boolean;
  product?: { nameEn?: string; nameAr?: string; barcode?: string | null } | null;
}

interface SupplierPayment {
  id: string;
  documentNumber: string;
  paymentDate: string;
  amount: number;
  method: 'CASH' | 'BANK_TRANSFER';
  notes?: string | null;
  createdByName: string;
  purchaseReceiptId?: string | null;
}

/** Standalone, non-treasury-linked payment log (see AcSupplierPayment entity) — the only
 * mechanism the "+ تسجيل دفعة" modal writes to going forward. Has no method/documentNumber by
 * design, unlike the legacy SupplierPayment above. */
interface AcSupplierPayment {
  id: string;
  paymentDate: string;
  amount: number;
  notes?: string | null;
  createdByName: string;
}

/** Unified row shape merging legacy (treasury-linked) SupplierPayment rows with the new
 * standalone AcSupplierPayment rows, so "دفعات المورد" shows every payment ever recorded for this
 * supplier regardless of which mechanism wrote it. */
interface UnifiedPaymentRow {
  id: string;
  source: 'legacy' | 'standalone';
  paymentDate: string;
  amount: number;
  method: string | null;
  notes: string | null;
  createdByName: string;
  documentNumber: string | null;
}

interface AcSupplierTaxPayment {
  id: string;
  taxDate: string;
  amount: number;
  notes?: string | null;
  purchaseReceiptId?: string | null;
  createdByName: string;
}

function money(n: number): string {
  return formatAmount(n);
}

/** Computed from the year+quarter picker — "كل العام" spans the full calendar year, each quarter
 * its own 3-month window. Reuses the same {from,to} shape (and inDateRange) every other date
 * filter in this app already uses, so nothing new is introduced for the filtering mechanics. */
function quarterRange(year: string, quarter: Quarter): DateRange {
  if (quarter === 'ALL') return { from: `${year}-01-01`, to: `${year}-12-31` };
  const bounds: Record<Exclude<Quarter, 'ALL'>, [string, string]> = {
    Q1: [`${year}-01-01`, `${year}-03-31`],
    Q2: [`${year}-04-01`, `${year}-06-30`],
    Q3: [`${year}-07-01`, `${year}-09-30`],
    Q4: [`${year}-10-01`, `${year}-12-31`],
  };
  const [from, to] = bounds[quarter];
  return { from, to };
}

export function AcSupplierDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);

  const [tab, setTab] = useState<Tab>('payments');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState<Quarter>('ALL');
  const yearOptions = useMemo(() => Array.from({ length: 6 }, (_, i) => String(currentYear - 4 + i)), [currentYear]);
  const dateRange = useMemo(() => quarterRange(year, quarter), [year, quarter]);

  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('0');
  const [payNotes, setPayNotes] = useState('');

  const [taxOpen, setTaxOpen] = useState(false);
  const [taxAmount, setTaxAmount] = useState('0');
  const [taxDate, setTaxDate] = useState(localToday());
  const [taxReceiptId, setTaxReceiptId] = useState('');
  const [taxNotes, setTaxNotes] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<Supplier[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: !!companyId,
  });
  const supplier = useMemo(() => suppliersQuery.data?.find((s) => s.id === id), [suppliersQuery.data, id]);

  // Same endpoint PurchasingPage/SuppliersTab already use — returns every receipt for the company,
  // narrowed to this one supplier here.
  const receiptsQuery = useQuery({
    queryKey: ['purchase-receipts', companyId],
    queryFn: () => unwrap<PurchaseReceipt[]>(apiClient.get('/inventory/purchase-receipts', { params: { companyId } })),
    enabled: !!companyId,
  });

  const paymentsQuery = useQuery({
    queryKey: ['supplier-payments', companyId, id],
    queryFn: () =>
      unwrap<SupplierPayment[]>(apiClient.get('/supplier-payments', { params: { companyId, supplierId: id } })),
    enabled: !!companyId && !!id,
  });

  // The new standalone, non-treasury-linked payment log — everything recorded via this page's
  // own "+ تسجيل دفعة" modal from now on lands here instead of /supplier-payments.
  const acPaymentsQuery = useQuery({
    queryKey: ['ac-supplier-payments', companyId, id],
    queryFn: () =>
      unwrap<AcSupplierPayment[]>(apiClient.get('/ac-supplier-payments', { params: { companyId, supplierId: id } })),
    enabled: !!companyId && !!id,
  });

  const taxQuery = useQuery({
    queryKey: ['ac-supplier-tax-payments', companyId, id],
    queryFn: () =>
      unwrap<AcSupplierTaxPayment[]>(
        apiClient.get('/ac-supplier-tax-payments', { params: { companyId, supplierId: id } }),
      ),
    enabled: !!companyId && !!id,
  });

  // Everything below this line is filtered by the year/quarter picker above — for BROWSING one
  // period's own receipts/payments in the tabs. The reconciliation block further down deliberately
  // does NOT use these — a debt balance is a running total, not a period-scoped figure.
  const allSupplierReceipts = useMemo(
    () => (receiptsQuery.data ?? []).filter((r) => r.supplierId === id),
    [receiptsQuery.data, id],
  );
  const supplierReceipts = useMemo(
    () => allSupplierReceipts.filter((r) => inDateRange(r.receiptDate, dateRange)),
    [allSupplierReceipts, dateRange],
  );
  // Point 3: "البضاعة المجانية" is kept in its own table, entirely separate from cash purchases,
  // so the cash table alone can be reconciled directly against the supplier's own official
  // statement (which only ever lists what was actually invoiced/owed).
  const cashReceipts = useMemo(() => supplierReceipts.filter((r) => !r.isFreeGoods), [supplierReceipts]);
  const freeGoodsReceipts = useMemo(() => supplierReceipts.filter((r) => r.isFreeGoods), [supplierReceipts]);
  const totalCashPurchases = useMemo(
    () => cashReceipts.reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0),
    [cashReceipts],
  );

  // "دفعات المورد" shows every payment ever recorded for this supplier, merging the legacy
  // treasury-linked SupplierPayment rows with the new standalone AcSupplierPayment rows — the
  // legacy rows are historical fact (real money that left the business via Cash/Bank) and stay
  // visible even though new payments no longer use that mechanism.
  const unifiedPayments = useMemo<UnifiedPaymentRow[]>(() => {
    const legacy: UnifiedPaymentRow[] = (paymentsQuery.data ?? []).map((p) => ({
      id: p.id,
      source: 'legacy',
      paymentDate: p.paymentDate,
      amount: Number(p.amount),
      method: t(`paymentMethod.${p.method}`),
      notes: p.notes ?? null,
      createdByName: p.createdByName,
      documentNumber: p.documentNumber,
    }));
    const standalone: UnifiedPaymentRow[] = (acPaymentsQuery.data ?? []).map((p) => ({
      id: p.id,
      source: 'standalone',
      paymentDate: p.paymentDate,
      amount: Number(p.amount),
      method: null,
      notes: p.notes ?? null,
      createdByName: p.createdByName,
      documentNumber: null,
    }));
    return [...legacy, ...standalone].sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1));
  }, [paymentsQuery.data, acPaymentsQuery.data, t]);

  const filteredPayments = useMemo(
    () => unifiedPayments.filter((p) => inDateRange(p.paymentDate, dateRange)),
    [unifiedPayments, dateRange],
  );
  const totalPayments = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [filteredPayments],
  );

  const filteredTaxPayments = useMemo(
    () => (taxQuery.data ?? []).filter((p) => inDateRange(p.taxDate, dateRange)),
    [taxQuery.data, dateRange],
  );
  const totalTaxForPeriod = useMemo(
    () => filteredTaxPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [filteredTaxPayments],
  );

  /**
   * Account reconciliation (point 2): إجمالي الفواتير المشتراة بالسعر الأساسي - إجمالي الدفعات
   * النقدية المسددة = الرصيد المتبقي الفعلي. Always computed from the supplier's FULL history
   * (never the year/quarter filter above) since a debt balance is cumulative by nature — scoping
   * it to one period would misreport it whenever a purchase and its payment land in different
   * periods. Free-goods receipts are excluded from "الفواتير المشتراة بالسعر الأساسي" by
   * construction (their totalAmount is always 0), matching point 3's required separation.
   *
   * "Total paid" must count money paid three different ways without double-counting: (a) paidAmount
   * recorded directly on a receipt (at creation, or via a later per-receipt "دفع المتبقي" action,
   * which increments the receipt's own paidAmount AND writes a tied SupplierPayment row for the
   * same money), (b) a general/untied SupplierPayment (the "سداد المتبقي" bulk action — legacy,
   * treasury-linked, real money that already left the business), and (c) the new standalone
   * AcSupplierPayment log this page's own "+ تسجيل دفعة" modal now writes to. (a)+(b) mirror
   * SupplierStatementPage.tsx's own proven legacyVoucherRows/tiedAmountByReceipt logic exactly, so
   * this never disagrees with that page's totals for the same underlying data; (c) is summed on top
   * unconditionally since it's a disjoint, independently-tracked payment source.
   */
  const allCashReceipts = useMemo(() => allSupplierReceipts.filter((r) => !r.isFreeGoods), [allSupplierReceipts]);
  const totalCashPurchasesAllTime = useMemo(
    () => allCashReceipts.reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0),
    [allCashReceipts],
  );
  const tiedAmountByReceiptAllTime = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of paymentsQuery.data ?? []) {
      if (!p.purchaseReceiptId) continue;
      map.set(p.purchaseReceiptId, (map.get(p.purchaseReceiptId) ?? 0) + Number(p.amount));
    }
    return map;
  }, [paymentsQuery.data]);
  const totalPaidAllTime = useMemo(() => {
    const legacy = allSupplierReceipts.reduce((sum, r) => {
      const amount = Number(r.paidAmount ?? 0) - (tiedAmountByReceiptAllTime.get(r.id) ?? 0);
      return sum + Math.max(0, amount);
    }, 0);
    const real = (paymentsQuery.data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    const standalone = (acPaymentsQuery.data ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    return legacy + real + standalone;
  }, [allSupplierReceipts, tiedAmountByReceiptAllTime, paymentsQuery.data, acPaymentsQuery.data]);
  const netBalanceOwed = totalCashPurchasesAllTime - totalPaidAllTime;

  function invalidatePayments() {
    queryClient.invalidateQueries({ queryKey: ['supplier-payments', companyId, id] });
    queryClient.invalidateQueries({ queryKey: ['ac-supplier-payments', companyId, id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
  }

  function invalidateTax() {
    queryClient.invalidateQueries({ queryKey: ['ac-supplier-tax-payments', companyId, id] });
  }

  // Writes only to the new standalone log — no method field, never touches the treasury.
  const payMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/ac-supplier-payments', {
        paymentDate: localToday(),
        supplierId: id,
        amount: Number(payAmount),
        notes: payNotes || undefined,
      }),
    onSuccess: () => {
      invalidatePayments();
      setPayOpen(false);
      setPayAmount('0');
      setPayNotes('');
      toast.success(t('suppliers.paymentSavedSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (p: UnifiedPaymentRow) =>
      p.source === 'legacy'
        ? apiClient.delete(`/supplier-payments/${p.id}`)
        : apiClient.delete(`/ac-supplier-payments/${p.id}`),
    onSuccess: () => {
      invalidatePayments();
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDeletePayment(p: UnifiedPaymentRow) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: p.documentNumber ?? p.paymentDate }) });
    if (ok) deletePaymentMutation.mutate(p);
  }

  const taxMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/ac-supplier-tax-payments', {
        supplierId: id,
        taxDate,
        amount: Number(taxAmount),
        purchaseReceiptId: taxReceiptId || undefined,
        notes: taxNotes || undefined,
      }),
    onSuccess: () => {
      invalidateTax();
      setTaxOpen(false);
      setTaxAmount('0');
      setTaxDate(localToday());
      setTaxReceiptId('');
      setTaxNotes('');
      toast.success(t('suppliers.taxSavedSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteTaxMutation = useMutation({
    mutationFn: (taxId: string) => apiClient.delete(`/ac-supplier-tax-payments/${taxId}`),
    onSuccess: () => {
      invalidateTax();
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDeleteTax(p: AcSupplierTaxPayment) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: money(Number(p.amount)) }) });
    if (ok) deleteTaxMutation.mutate(p.id);
  }

  const paymentColumns: Column<UnifiedPaymentRow>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber ?? '—' },
    { header: t('common.date'), accessor: (r) => r.paymentDate },
    { header: t('fields.amount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('fields.method'), accessor: (r) => r.method ?? '—' },
    { header: t('table.description'), accessor: (r) => r.notes ?? '—' },
    { header: t('suppliers.createdBy'), accessor: (r) => r.createdByName },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <button
          type="button"
          className="text-red-600 hover:underline"
          disabled={deletePaymentMutation.isPending}
          onClick={() => handleDeletePayment(r)}
        >
          {t('common.delete')}
        </button>
      ),
      align: 'center',
    },
  ];

  const taxColumns: Column<AcSupplierTaxPayment>[] = [
    { header: t('common.date'), accessor: (r) => r.taxDate },
    { header: t('fields.amount'), accessor: (r) => money(Number(r.amount)), align: 'right' },
    {
      header: t('fields.invoiceOptional'),
      accessor: (r) => allSupplierReceipts.find((rec) => rec.id === r.purchaseReceiptId)?.documentNumber ?? '—',
    },
    { header: t('table.description'), accessor: (r) => r.notes ?? '—' },
    { header: t('suppliers.createdBy'), accessor: (r) => r.createdByName },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <button
          type="button"
          className="text-red-600 hover:underline"
          disabled={deleteTaxMutation.isPending}
          onClick={() => handleDeleteTax(r)}
        >
          {t('common.delete')}
        </button>
      ),
      align: 'center',
    },
  ];

  // Column order matches the request exactly: التاريخ، الصنف، القدرة، الكمية، سعر العبوة، الإجمالي.
  const purchaseColumns: Column<PurchaseReceipt>[] = [
    { header: t('common.date'), accessor: (r) => r.receiptDate },
    { header: t('fields.product'), accessor: (r) => r.product?.nameEn ?? '—' },
    { header: t('products.capacityLabel'), accessor: (r) => r.product?.barcode ?? '—' },
    {
      header: t('fields.quantityPackages'),
      accessor: (r) => `${formatAmount(r.quantityPackages)} × ${formatQuantity(r.unitsPerPackage)}`,
      align: 'right',
    },
    { header: t('fields.packagePurchasePrice'), accessor: (r) => money(r.packagePurchasePrice), align: 'right' },
    { header: t('fields.totalAmount'), accessor: (r) => money(r.totalAmount), align: 'right' },
  ];

  return (
    <div>
      <PageHeader title={supplier?.companyName ?? t('nav.suppliers')} />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FormField label={t('common.year')}>
          <Select value={year} onChange={(e) => setYear(e.target.value)}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('partners.quarter')}>
          <Select value={quarter} onChange={(e) => setQuarter(e.target.value as Quarter)}>
            <option value="ALL">{t('partners.fullYear')}</option>
            <option value="Q1">{t('partners.q1')}</option>
            <option value="Q2">{t('partners.q2')}</option>
            <option value="Q3">{t('partners.q3')}</option>
            <option value="Q4">{t('partners.q4')}</option>
          </Select>
        </FormField>
      </div>

      {/* Point 2: مطابقة الأرصدة — always the supplier's full history, independent of the
          year/quarter filter above (see netBalanceOwed's own comment for why). Shown regardless of
          which tab is active since it's a standing summary, not something tied to one tab's data. */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">{t('suppliers.totalCashPurchasesBase')}</div>
          <div className="mt-1 text-lg font-semibold">{money(totalCashPurchasesAllTime)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">{t('suppliers.totalPaymentsLabel')}</div>
          <div className="mt-1 text-lg font-semibold">{money(totalPaidAllTime)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">{t('suppliers.netBalanceOwed')}</div>
          <div className={`mt-1 text-lg font-semibold ${netBalanceOwed > 0 ? 'text-red-600' : ''}`}>
            {money(netBalanceOwed)}
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2 text-sm">
        <button
          className={`rounded-lg px-3 py-1.5 ${tab === 'payments' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
          onClick={() => setTab('payments')}
        >
          {t('suppliers.supplierPaymentsTab')}
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 ${tab === 'purchases' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
          onClick={() => setTab('purchases')}
        >
          {t('nav.purchasing')}
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 ${tab === 'tax' ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
          onClick={() => setTab('tax')}
        >
          {t('suppliers.salesTaxTab')}
        </button>
      </div>

      {tab === 'payments' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
              {t('suppliers.totalPaymentsLabel')}: <span className="font-semibold">{money(totalPayments)}</span>
            </div>
            <Button onClick={() => setPayOpen(true)}>+ {t('actions.recordPayment')}</Button>
          </div>
          <DataTable
            columns={paymentColumns}
            data={filteredPayments}
            keyField={(r) => r.id}
            isLoading={paymentsQuery.isLoading || acPaymentsQuery.isLoading}
          />
        </>
      )}

      {tab === 'purchases' && (
        <div className="flex flex-col gap-8">
          {/* Point 3: كل جدول منفصل تماماً عن الآخر — المشتريات النقدية وحدها هي ما يُطابَق مع كشف
              حساب المورد الرسمي؛ البضاعة المجانية لا تظهر فيه إطلاقاً لأن قيمتها المالية دائماً صفر. */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">{t('suppliers.cashPurchasesSection')}</h3>
              <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
                {t('fields.totalPurchases')}: <span className="font-semibold">{money(totalCashPurchases)}</span>
              </div>
            </div>
            <DataTable
              columns={purchaseColumns}
              data={cashReceipts}
              keyField={(r) => r.id}
              isLoading={receiptsQuery.isLoading}
            />
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold">{t('suppliers.freeGoodsSection')}</h3>
            </div>
            <DataTable
              columns={purchaseColumns}
              data={freeGoodsReceipts}
              keyField={(r) => r.id}
              isLoading={receiptsQuery.isLoading}
              searchable={false}
            />
          </div>
        </div>
      )}

      {tab === 'tax' && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
              {t('suppliers.totalTaxForPeriod')}: <span className="font-semibold">{money(totalTaxForPeriod)}</span>
            </div>
            <Button onClick={() => setTaxOpen(true)}>+ {t('actions.recordTax')}</Button>
          </div>
          <DataTable
            columns={taxColumns}
            data={filteredTaxPayments}
            keyField={(r) => r.id}
            isLoading={taxQuery.isLoading}
          />
        </>
      )}

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t('actions.recordPayment')}>
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
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={payMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={taxOpen} onClose={() => setTaxOpen(false)} title={t('actions.recordTax')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            taxMutation.mutate();
          }}
        >
          <FormField label={t('common.date')}>
            <Input type="date" required value={taxDate} onChange={(e) => setTaxDate(e.target.value)} />
          </FormField>
          <FormField label={t('fields.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={taxAmount}
              onChange={(e) => setTaxAmount(e.target.value)}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('fields.invoiceOptional')}>
              <Select value={taxReceiptId} onChange={(e) => setTaxReceiptId(e.target.value)}>
                <option value="">{t('suppliers.noSpecificInvoice')}</option>
                {allSupplierReceipts.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.documentNumber} — {r.receiptDate}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={taxNotes} onChange={(e) => setTaxNotes(e.target.value)} />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setTaxOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={taxMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
