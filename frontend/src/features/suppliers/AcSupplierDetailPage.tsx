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
 * services. /suppliers and /inventory/purchase-receipts are generic parties/purchasing resources
 * shared company-wide, not part of the Cargo/Shipping import-tracking feature set, so reusing them
 * here doesn't couple this screen to that system. /ac-supplier-payments and
 * /ac-supplier-tax-payments are AC-only, standalone endpoints (ac-supplier-ledger module) — this is
 * where the page's own "+ تسجيل دفعة"/"+ تسجيل ضريبة" actions write, and (since a "تسجيل دفعة" now
 * also debits a real treasury account, see payMutation) where AC purchase receipts paid via "رصيد
 * المورد" post their consumption too (PurchaseReceiptsService.deductForPurchase).
 *
 * The reconciliation row's 3 cards, by explicit request, now pivot entirely around this standalone
 * ledger instead of the legacy per-receipt paidAmount/SupplierPayment bookkeeping the rest of the
 * app still uses elsewhere (e.g. SupplierStatementPage.tsx): "إجمالي دفعات المورد المسجلة" (this
 * ledger's own all-time sum — reuses the same figure the "دفعات المورد" tab's own badge shows,
 * just unfiltered by the year/quarter picker) stands in for what "إجمالي المدفوعات" used to mean,
 * and "الرصيد المتبقي الفعلي" is now إجمالي الفواتير − هذا المجموع. There used to be a 4th card
 * comparing this log's total against purchases ("الفرق بين دفعات المورد وإجمالي المشتراة") —
 * removed entirely by an earlier explicit request; it no longer exists anywhere in this screen.
 */

type Tab = 'payments' | 'purchases' | 'tax';
type Quarter = 'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

/** Only the two fields this page reads off /dashboard/summary — same endpoint
 * PurchasingPage.tsx's own withdrawal-source badges use, so these numbers always agree with what
 * that screen (and the Dashboard/Treasury screens) show for the same company. */
interface BranchBalanceSummary {
  cashBalance: number;
  bankBalance: number;
}

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

/** This screen's own standalone payment log (see AcSupplierPayment entity) — the only mechanism
 * the "+ تسجيل دفعة" modal writes to, and now the source of the top reconciliation cards too. */
interface AcSupplierPayment {
  id: string;
  paymentDate: string;
  amount: number;
  notes?: string | null;
  createdByName: string;
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
  const [payAccount, setPayAccount] = useState<'CASH' | 'BANK'>('CASH');

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

  // Everything recorded via this page's own "+ تسجيل دفعة" modal lands here instead of
  // /supplier-payments — a standalone log with its own running balance (see the reconciliation
  // cards below), though a user-entered row here now also debits a real treasury account (see
  // payMutation and the withdrawal-source field in that modal).
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

  // Live Cash/Bank balances for the "تسجيل دفعة" modal's withdrawal-source badges below — same
  // /dashboard/summary endpoint and design as PurchasingPage.tsx's own payment-source field, only
  // fetched while that modal is actually open.
  const branchBalanceQuery = useQuery({
    queryKey: ['dashboard-summary', companyId],
    queryFn: () => unwrap<BranchBalanceSummary>(apiClient.get('/dashboard/summary', { params: { companyId } })),
    enabled: payOpen && !!companyId,
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

  // "دفعات المورد" tab: every row (both real "تسجيل دفعة" entries and the negative
  // ترحيل/consumption ones) narrowed to the year/quarter filter, for browsing one period's
  // activity. The reconciliation card above uses the unfiltered, positive-only version of this
  // same data — see totalRegisteredSupplierPaymentsAllTime.
  const filteredPayments = useMemo(
    () => (acPaymentsQuery.data ?? []).filter((p) => inDateRange(p.paymentDate, dateRange)),
    [acPaymentsQuery.data, dateRange],
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
   * Account reconciliation (top 3 cards), by explicit request: إجمالي دفعات المورد المسجلة -
   * إجمالي الفواتير المشتراة بالسعر الأساسي = الرصيد المتبقي الفعلي — payments minus purchases, not
   * the other way around, so the SIGN reads directly as the company's own position: negative means
   * the company has purchased more than it's actually paid ("مديونية على شركتنا" — a debt against
   * the company, it still owes the supplier the difference); positive means the company has paid
   * more than it's purchased ("رصيد لشركتنا" — a credit balance in the company's favor, e.g. an
   * advance not yet consumed by a purchase). See statusOf() below for the label/color this drives.
   * Always computed from the supplier's FULL history (never the year/quarter filter above) since a
   * balance is cumulative by nature — scoping it to one period would misreport it whenever a
   * purchase and its payment land in different periods. Free-goods receipts are excluded from
   * "الفواتير المشتراة بالسعر الأساسي" by construction (their totalAmount is always 0), matching
   * point 3's required separation.
   *
   * "إجمالي دفعات المورد المسجلة" is the standalone AcSupplierPayment ledger's POSITIVE rows only —
   * real money the company actually handed the supplier (every "تسجيل دفعة", see payMutation).
   * Deliberately EXCLUDES the ledger's negative rows: PurchaseReceiptsService.deductForPurchase's
   * consumption entries (a purchase paid via "رصيد المورد") and the one-off CASH→رصيد المورد
   * migration's retroactive rows — those were never new money leaving the company, just
   * already-received credit being marked as spent, so summing them in here would understate this
   * card for no accounting reason. SupplierStatementPage.tsx is untouched and still uses its own,
   * separate calculation — this screen alone pivots around the AC-only ledger.
   */
  const allCashReceipts = useMemo(() => allSupplierReceipts.filter((r) => !r.isFreeGoods), [allSupplierReceipts]);
  const totalCashPurchasesAllTime = useMemo(
    () => allCashReceipts.reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0),
    [allCashReceipts],
  );
  const totalRegisteredSupplierPaymentsAllTime = useMemo(
    () =>
      (acPaymentsQuery.data ?? [])
        .filter((p) => Number(p.amount) > 0)
        .reduce((sum, p) => sum + Number(p.amount), 0),
    [acPaymentsQuery.data],
  );
  const netBalanceOwed = totalRegisteredSupplierPaymentsAllTime - totalCashPurchasesAllTime;
  /** Dynamic label + color for netBalanceOwed's card, by explicit request — three states, not
   * just positive/negative, so an exactly-settled account gets its own neutral treatment instead
   * of silently falling into whichever branch happens to match zero. */
  const netBalanceStatus =
    netBalanceOwed < 0
      ? { label: t('suppliers.netBalanceDebt'), className: 'text-red-600' }
      : netBalanceOwed > 0
        ? { label: t('suppliers.netBalanceCredit'), className: 'text-green-600' }
        : { label: t('suppliers.netBalanceSettled'), className: 'text-blue-600' };

  function invalidatePayments() {
    queryClient.invalidateQueries({ queryKey: ['supplier-payments', companyId, id] });
    queryClient.invalidateQueries({ queryKey: ['ac-supplier-payments', companyId, id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
  }

  function invalidateTax() {
    queryClient.invalidateQueries({ queryKey: ['ac-supplier-tax-payments', companyId, id] });
  }

  // Draws the amount from the chosen treasury account (see paymentAccount) and records it as a
  // "دفعة مورد" in the same standalone log, in one server-side transaction — see
  // AcSupplierPaymentsService.create().
  const payMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/ac-supplier-payments', {
        paymentDate: localToday(),
        supplierId: id,
        amount: Number(payAmount),
        paymentAccount: payAccount,
        notes: payNotes || undefined,
      }),
    onSuccess: () => {
      invalidatePayments();
      setPayOpen(false);
      setPayAmount('0');
      setPayNotes('');
      setPayAccount('CASH');
      toast.success(t('suppliers.paymentSavedSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (paymentId: string) => apiClient.delete(`/ac-supplier-payments/${paymentId}`),
    onSuccess: () => {
      invalidatePayments();
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDeletePayment(p: AcSupplierPayment) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: money(Number(p.amount)) }) });
    if (ok) deletePaymentMutation.mutate(p.id);
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

  const paymentColumns: Column<AcSupplierPayment>[] = [
    { header: t('common.date'), accessor: (r) => r.paymentDate },
    { header: t('fields.amount'), accessor: (r) => money(Number(r.amount)), align: 'right' },
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
          <div className="text-xs text-[var(--text-muted)]">{t('suppliers.totalIndependentPayments')}</div>
          <div className="mt-1 text-lg font-semibold">{money(totalRegisteredSupplierPaymentsAllTime)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">{t('suppliers.totalCashPurchasesBase')}</div>
          <div className="mt-1 text-lg font-semibold">{money(totalCashPurchasesAllTime)}</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="text-xs text-[var(--text-muted)]">{t('suppliers.netBalanceOwed')}</div>
          <div className={`mt-1 text-lg font-semibold ${netBalanceStatus.className}`}>{money(netBalanceOwed)}</div>
          <div className={`mt-0.5 text-xs font-medium ${netBalanceStatus.className}`}>{netBalanceStatus.label}</div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
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
          {/* The period total used to be repeated here too ("إجمالي دفعات المورد المسجلة: X") —
              removed by explicit request as an unwarranted duplicate of the reconciliation card
              above, which already shows this same figure (all-time, not period-filtered). */}
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setPayOpen(true)}>+ {t('actions.recordPayment')}</Button>
          </div>
          <DataTable
            columns={paymentColumns}
            data={filteredPayments}
            keyField={(r) => r.id}
            isLoading={acPaymentsQuery.isLoading}
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
            <FormField label={t('suppliers.withdrawalSource')}>
              {/* Live balances, same endpoint/design as PurchasingPage.tsx's own payment-source
                  field — lets the user see available liquidity before confirming, without leaving
                  this modal. The account matching the current selection is highlighted; entering
                  more than that account actually holds shows a warning below (the real,
                  authoritative check still happens server-side in AcSupplierPaymentsService via
                  assertSufficientBalance — this is a pre-submit hint, not a substitute for it). */}
              <div className="mb-2 flex flex-wrap gap-2">
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    payAccount === 'BANK'
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                      : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}
                >
                  <span>🏦</span>
                  <span>
                    {t('treasury.paymentAccounts.BANK')}: {formatAmount(branchBalanceQuery.data?.bankBalance ?? 0)}
                  </span>
                </div>
                <div
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    payAccount === 'CASH'
                      ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                      : 'border-[var(--border)] text-[var(--text-muted)]'
                  }`}
                >
                  <span>💵</span>
                  <span>
                    {t('treasury.paymentAccounts.CASH')}: {formatAmount(branchBalanceQuery.data?.cashBalance ?? 0)}
                  </span>
                </div>
              </div>
              <Select required value={payAccount} onChange={(e) => setPayAccount(e.target.value as 'CASH' | 'BANK')}>
                <option value="CASH">{t('suppliers.withdrawalSourceCash')}</option>
                <option value="BANK">{t('suppliers.withdrawalSourceBank')}</option>
              </Select>
              {(() => {
                const available =
                  payAccount === 'BANK' ? branchBalanceQuery.data?.bankBalance : branchBalanceQuery.data?.cashBalance;
                if (available === undefined || Number(payAmount) <= available) return null;
                return <p className="mt-1 text-xs text-red-600">{t('purchasing.insufficientBalanceWarning')}</p>;
              })()}
            </FormField>
          </div>
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
