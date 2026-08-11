import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';
import { useSalesRepLock } from './useSalesRepLock';
import { useActiveCompany } from '../../lib/use-active-company';

interface Company {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}
interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface SalesPayment {
  id: string;
  documentNumber: string;
  paymentDate: string;
  customerId?: string | null;
  invoiceId?: string | null;
  branchId?: string | null;
  salesRepresentativeId?: string | null;
  method: string;
  amount: number;
  notes?: string | null;
  customer?: { name: string } | null;
  invoice?: { documentNumber: string };
  salesRepresentative: { name: string } | null;
  paymentAccount?: 'CASH' | 'BANK' | null;
  // Who was actually logged in when this receipt was recorded — always set (unlike the optional
  // salesRepresentative link), so this is the reliable "responsible person" signal for the table.
  createdByName?: string;
}
interface Customer {
  id: string;
  name: string;
}
interface SalesRepresentative {
  id: string;
  name: string;
  userId?: string | null;
  branchId?: string | null;
}

export function SalesPaymentsPage() {
  const { t } = useTranslation();
  const { isPrintingPress, isStationery, isAirConditioning } = useActiveCompany();
  // Stationery/AC keep the normal customer+method fields (they're not Press) but must also pick a
  // بنك/كاش deposit account, same requirement as Press — see SalesPaymentsService.create()'s
  // assertPaymentAccountProvided. Branch stays Press-only, unrelated to this request.
  const requiresPaymentAccount = isPrintingPress || isStationery || isAirConditioning;
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canEdit = useAuthStore((s) => s.hasPermission('sales.payment.edit'));
  const canDelete = useAuthStore((s) => s.hasPermission('sales.payment.delete'));
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [salesRepresentativeId, setSalesRepresentativeId] = useState('');
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('0');
  const [notes, setNotes] = useState('');
  // Printing Press only — every other company's receipt always settles into CASH regardless of
  // `method` (see sales-payments.service.ts, which defaults to CASH when this is omitted). Starts
  // unset (rather than defaulting to CASH) so the branch manager must explicitly pick where the
  // money actually went — a receipt can't be saved until this is chosen.
  const [paymentAccount, setPaymentAccount] = useState<'CASH' | 'BANK' | ''>('');
  // Printing Press only — which branch's cash/bank vault this receipt actually settles into. This
  // used to be derived indirectly from the selected sales representative's branch, but that field
  // is optional (a walk-in cash receipt has no sales rep at all), so plenty of receipts ended up
  // with no branchId — invisible to the Dashboard's per-branch "خزينة الفرع (كاش)" card, which
  // filters cash_movements by branchId. An explicit, required field (same pattern as
  // ExpensesPage/PurchasingPage) guarantees every receipt is always attributed to a real branch.
  const [branchId, setBranchId] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });

  // Arriving from Outstanding Balances' "Record Payment / Collect" quick action prefills and
  // auto-opens the create-payment modal, instead of making the user re-enter what's already known.
  useEffect(() => {
    const prefillCustomerId = searchParams.get('customerId');
    if (!prefillCustomerId) return;
    setCustomerId(prefillCustomerId);
    setInvoiceId(searchParams.get('invoiceId') ?? '');
    const prefillAmount = searchParams.get('amount');
    if (prefillAmount) setAmount(prefillAmount);
    setModalOpen(true);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paymentsQuery = useQuery({
    queryKey: ['sales-payments', companyId],
    queryFn: () => unwrap<SalesPayment[]>(apiClient.get('/sales/payments', { params: { companyId } })),
    enabled: !!companyId,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  // Printing Press's simplified receipt modal has no customer field at all — see the form below.
  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: modalOpen && !isPrintingPress && !!companyId,
  });

  const salesRepsQuery = useQuery({
    queryKey: ['sales-representatives'],
    queryFn: () => unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives')),
    enabled: modalOpen,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && modalOpen && !!companyId,
  });

  const { isAdmin, ownRep, currentUserName } = useSalesRepLock(salesRepsQuery.data);
  const effectiveSalesRepId = isAdmin ? salesRepresentativeId : ownRep?.id ?? '';

  function resetForm() {
    setModalOpen(false);
    setEditingId(null);
    setCustomerId('');
    setInvoiceId('');
    setSalesRepresentativeId('');
    setAmount('0');
    setNotes('');
    setPaymentAccount('');
    setBranchId('');
  }

  function invalidateAfterSave() {
    queryClient.invalidateQueries({ queryKey: ['sales-payments'] });
    queryClient.invalidateQueries({ queryKey: ['customer-statement'] });
    queryClient.invalidateQueries({ queryKey: ['customer-outstanding-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-recent-tx'] });
    queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        paymentDate: localToday(),
        // Printing Press's simplified receipt form has neither field — the backend defaults
        // customerId to null and method to CASH when omitted (see CreateSalesPaymentDto).
        customerId: isPrintingPress ? undefined : customerId,
        companyId,
        invoiceId: invoiceId || undefined,
        salesRepresentativeId: effectiveSalesRepId || undefined,
        method: isPrintingPress ? undefined : method,
        amount: Number(amount),
        notes: notes || undefined,
        paymentAccount: requiresPaymentAccount ? paymentAccount || undefined : undefined,
        branchId: isPrintingPress ? branchId || undefined : undefined,
      };
      return editingId
        ? apiClient.patch(`/sales/payments/${editingId}`, payload)
        : apiClient.post('/sales/payments', payload);
    },
    onSuccess: () => {
      invalidateAfterSave();
      const wasEditing = !!editingId;
      resetForm();
      toast.success(wasEditing ? t('common.updatedSuccessfully') : t('salesPayments.paymentSavedSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sales/payments/${id}`),
    onSuccess: () => {
      invalidateAfterSave();
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  function startEdit(r: SalesPayment) {
    setEditingId(r.id);
    setCustomerId(r.customerId ?? '');
    setInvoiceId(r.invoiceId ?? '');
    setSalesRepresentativeId(r.salesRepresentativeId ?? '');
    setMethod(r.method ?? 'CASH');
    setAmount(String(r.amount));
    setNotes(r.notes ?? '');
    setPaymentAccount(r.paymentAccount ?? '');
    setBranchId(r.branchId ?? '');
    setModalOpen(true);
  }

  async function handleDelete(r: SalesPayment) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: r.documentNumber }) });
    if (ok) deleteMutation.mutate(r.id);
  }

  const filteredPayments = useMemo(
    () => (paymentsQuery.data ?? []).filter((p) => inDateRange(p.paymentDate, dateRange)),
    [paymentsQuery.data, dateRange],
  );

  // Same edit/delete affordance used everywhere else in the app (Purchasing, Payroll, ...): a
  // pencil and a trash-bin button, wired to PATCH/DELETE /sales/payments/:id with a confirmation
  // dialog before the delete actually fires.
  const actionsColumn: Column<SalesPayment> | null =
    canEdit || canDelete
      ? {
          header: t('common.actions'),
          accessor: (r) => (
            <div className="flex justify-center gap-3">
              {canEdit && (
                <button
                  type="button"
                  className="text-primary-600 hover:underline"
                  title={t('common.edit')}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEdit(r);
                  }}
                >
                  ✏️
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="text-red-600 hover:underline"
                  title={t('common.delete')}
                  disabled={deleteMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(r);
                  }}
                >
                  🗑️
                </button>
              )}
            </div>
          ),
          align: 'center',
        }
      : null;

  // Printing Press receipts aren't tied to a customer/invoice or a descriptive payment method —
  // they're a branch manager's cash deposit, so the table drops those three columns entirely and
  // surfaces the settled account instead. Every other company keeps the original column set.
  const baseColumns: Column<SalesPayment>[] = isPrintingPress
    ? [
        { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
        { header: t('common.date'), accessor: (r) => r.paymentDate },
        { header: t('common.total'), accessor: (r) => formatAmount(r.amount), align: 'right' },
        { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.paymentAccount ?? 'CASH'}`) },
        { header: t('salesPayments.responsiblePersonColumn'), accessor: (r) => r.createdByName ?? '—' },
        { header: t('table.description'), accessor: (r) => r.notes ?? '—' },
      ]
    : [
        { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
        { header: t('common.date'), accessor: (r) => r.paymentDate },
        { header: t('nav.customers'), accessor: (r) => r.customer?.name },
        { header: t('fields.salesRepresentative'), accessor: (r) => r.salesRepresentative?.name ?? '—' },
        { header: t('fields.method'), accessor: (r) => t(`paymentMethod.${r.method}`, r.method) },
        // Which treasury account this receipt actually settled into — CASH or BANK, derived from
        // `method` at creation time (see SalesPaymentsService.create()) rather than always CASH,
        // so a bank-transfer receipt is visibly distinguishable from an actual cash receipt here,
        // not just in the underlying (invisible) treasury balances.
        { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.paymentAccount ?? 'CASH'}`) },
        { header: t('fields.invoice'), accessor: (r) => r.invoice?.documentNumber ?? '—' },
        { header: t('table.description'), accessor: (r) => r.notes ?? '—' },
        { header: t('common.total'), accessor: (r) => formatAmount(r.amount), align: 'right' },
      ];
  const columns: Column<SalesPayment>[] = actionsColumn ? [...baseColumns, actionsColumn] : baseColumns;

  function handlePrint() {
    const previousTitle = document.title;
    document.title = t('salesPayments.reportTitle');
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    // Toggled just before the html2canvas snapshot so the print-only header (normally
    // display:none on screen) renders into the capture — html2canvas reads the live DOM's
    // regular stylesheet, not @media print, so a plain class toggle is what actually shows it.
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName('تقرير المقبوضات', company?.nameAr || company?.nameEn, localToday()),
        'landscape',
      );
    } catch (err) {
      toast.error(t('salesPayments.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Sales payments PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.salesPayments')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              {t('common.print')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
              {t('actions.downloadPdf')}
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex justify-end print:hidden">
        <Button
          onClick={() => {
            setEditingId(null);
            setCustomerId('');
            setInvoiceId('');
            setAmount('0');
            setNotes('');
            setPaymentAccount('');
            setBranchId('');
            setModalOpen(true);
          }}
        >
          + {t('common.create')}
        </Button>
      </div>

      <div className="print:hidden">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div ref={printRef} className="sales-payments-print">
        <div className="sales-payments-print-header">
          <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{t('salesPayments.reportTitle')}</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>
            {t('imports.printDate')}: {localToday()}
          </div>
        </div>

        {/* pageSize forced to the full array length so print/PDF captures every row, not just
            the current on-screen page; searchable disabled so the search box (irrelevant once
            printed) doesn't show up in the output. */}
        <DataTable
          columns={columns}
          data={filteredPayments}
          keyField={(r) => r.id}
          isLoading={paymentsQuery.isLoading}
          searchable={false}
          pageSize={Math.max(filteredPayments.length, 1)}
        />
      </div>

      <Modal open={modalOpen} onClose={resetForm} title={editingId ? t('common.edit') : t('common.create')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          {!isPrintingPress && (
            <FormField label={t('nav.customers')}>
              <Select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">{t('actions.selectCustomer')}</option>
                {(customersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          {!isPrintingPress && (
            <FormField label={t('fields.method')}>
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="CASH">{t('paymentMethod.CASH')}</option>
                <option value="BANK_TRANSFER">{t('paymentMethod.BANK_TRANSFER')}</option>
                <option value="CHEQUE">{t('paymentMethod.CHEQUE')}</option>
                <option value="CARD">{t('paymentMethod.CARD')}</option>
                <option value="ONLINE">{t('paymentMethod.ONLINE')}</option>
              </Select>
            </FormField>
          )}
          <FormField label={t('fields.amount')}>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          {requiresPaymentAccount && (
            <FormField label={t('salesPayments.depositAccountLabel')} required>
              <Select
                required
                value={paymentAccount}
                onChange={(e) => setPaymentAccount(e.target.value as 'CASH' | 'BANK' | '')}
              >
                <option value="">{t('salesPayments.selectDepositAccount')}</option>
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
              </Select>
            </FormField>
          )}
          {isPrintingPress && (
            <FormField label={t('fields.branch')} required>
              <Select required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">—</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label={t(isPrintingPress ? 'fields.salesRepresentativePress' : 'fields.salesRepresentative')}>
            <Select
              value={effectiveSalesRepId}
              disabled={!isAdmin}
              onChange={(e) => setSalesRepresentativeId(e.target.value)}
            >
              {isAdmin ? (
                <>
                  <option value="">{t('actions.selectSalesRep')}</option>
                  {(salesRepsQuery.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </>
              ) : (
                <option value={ownRep?.id ?? ''}>{ownRep?.name ?? currentUserName}</option>
              )}
            </Select>
          </FormField>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={resetForm}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                saveMutation.isPending || (isPrintingPress && !branchId) || (requiresPaymentAccount && !paymentAccount)
              }
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
