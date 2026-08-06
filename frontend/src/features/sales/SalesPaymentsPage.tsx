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
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { useSalesRepLock } from './useSalesRepLock';
import { useActiveCompany } from '../../lib/use-active-company';

interface Company {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

interface SalesPayment {
  id: string;
  documentNumber: string;
  paymentDate: string;
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
  const { isPrintingPress } = useActiveCompany();
  const toast = useToast();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [salesRepresentativeId, setSalesRepresentativeId] = useState('');
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('0');
  const [notes, setNotes] = useState('');
  // Printing Press only — every other company's receipt always settles into CASH regardless of
  // `method` (see sales-payments.service.ts, which defaults to CASH when this is omitted).
  const [paymentAccount, setPaymentAccount] = useState<'CASH' | 'BANK'>('CASH');
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

  const { isAdmin, ownRep, currentUserName } = useSalesRepLock(salesRepsQuery.data);
  const effectiveSalesRepId = isAdmin ? salesRepresentativeId : ownRep?.id ?? '';
  // Printing Press only — the receipt's cash movement is attributed to the payment's own sales
  // representative's branch, same reliable signal used everywhere else, no separate field needed.
  const resolvedBranchId = salesRepsQuery.data?.find((r) => r.id === effectiveSalesRepId)?.branchId ?? undefined;

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/sales/payments', {
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
        paymentAccount: isPrintingPress ? paymentAccount : undefined,
        branchId: isPrintingPress ? resolvedBranchId : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-payments'] });
      queryClient.invalidateQueries({ queryKey: ['customer-statement'] });
      queryClient.invalidateQueries({ queryKey: ['customer-outstanding-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent-tx'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      setModalOpen(false);
      setCustomerId('');
      setInvoiceId('');
      setSalesRepresentativeId('');
      setAmount('0');
      setNotes('');
      setPaymentAccount('CASH');
    },
  });

  const filteredPayments = useMemo(
    () => (paymentsQuery.data ?? []).filter((p) => inDateRange(p.paymentDate, dateRange)),
    [paymentsQuery.data, dateRange],
  );

  // Printing Press receipts aren't tied to a customer/invoice or a descriptive payment method —
  // they're a branch manager's cash deposit, so the table drops those three columns entirely and
  // surfaces the settled account instead. Every other company keeps the original column set.
  const columns: Column<SalesPayment>[] = isPrintingPress
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
        { header: t('fields.invoice'), accessor: (r) => r.invoice?.documentNumber ?? '—' },
        { header: t('table.description'), accessor: (r) => r.notes ?? '—' },
        { header: t('common.total'), accessor: (r) => formatAmount(r.amount), align: 'right' },
      ];

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
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      pdf.save(buildPdfFileName('تقرير المقبوضات', company?.nameAr || company?.nameEn, localToday()));
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
            <Button variant="secondary" onClick={handleDownloadPdf} disabled={pdfLoading}>
              {t('actions.downloadPdf')}
            </Button>
          </div>
        }
      />

      <div className="mb-3 flex justify-end print:hidden">
        <Button
          onClick={() => {
            setCustomerId('');
            setInvoiceId('');
            setAmount('0');
            setNotes('');
            setPaymentAccount('CASH');
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

        <DataTable columns={columns} data={filteredPayments} keyField={(r) => r.id} isLoading={paymentsQuery.isLoading} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('common.create')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
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
          {isPrintingPress && (
            <FormField label={t('treasury.paymentAccount')}>
              <Select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value as 'CASH' | 'BANK')}>
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
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
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setInvoiceId('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
