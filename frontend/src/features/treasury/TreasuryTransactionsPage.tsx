import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';

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

interface CashLedgerEntry {
  date: string;
  movementType: string;
  documentNumber: string;
  partyName: string | null;
  paymentAccount: 'CASH' | 'BANK';
  debit: number;
  credit: number;
  description: string | null;
  runningBalance: number;
}

interface DashboardSummary {
  cashBalance: number;
  bankBalance: number;
}

interface RepTreasuryBalance {
  salesRepresentativeId: string;
  name: string;
  balance: number;
}

type TransferAccount = 'CASH' | 'BANK' | 'REP_TREASURY';

function money(n: number): string {
  return formatAmount(n);
}

function emptyTransferForm() {
  return {
    movementDate: localToday(),
    fromAccount: 'CASH' as TransferAccount,
    toAccount: 'BANK' as 'CASH' | 'BANK',
    amount: '0',
    description: '',
    branchId: '',
    // Only meaningful when fromAccount === 'REP_TREASURY' — which مندوب's own pocket to clear.
    fromSalesRepresentativeId: '',
  };
}

export function TreasuryTransactionsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);
  // Bank/Cash split cards + the internal transfer feature are scoped to Printing Press, Air
  // Conditioning, and Stationery only — every other company keeps the single combined-balance
  // card unchanged.
  const { isPrintingPress, isAirConditioning, isStationery } = useActiveCompany();
  const showAccountSplit = isPrintingPress || isAirConditioning || isStationery;
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    movementDate: localToday(),
    type: 'EXPENSE',
    account: 'CASH',
    amount: '0',
    category: '',
    description: '',
  });
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState(emptyTransferForm);
  const [transferError, setTransferError] = useState<string | null>(null);

  const ledgerQuery = useQuery({
    queryKey: ['treasury-cash-ledger', companyId],
    queryFn: () => unwrap<CashLedgerEntry[]>(apiClient.get('/dashboard/cash-ledger', { params: { companyId } })),
    enabled: !!companyId,
  });

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', companyId],
    queryFn: () => unwrap<DashboardSummary>(apiClient.get('/dashboard/summary', { params: { companyId } })),
    enabled: !!companyId && showAccountSplit,
  });

  // "خزينة المندوب" card + the transfer modal's رep-picker — one row per sales representative
  // with their own uncleared-sales balance (see CashMovementsService.getRepTreasuryBalances).
  // Fetched for every company (a مندوب can exist under any of the 3), not just when
  // showAccountSplit, though the card itself only renders alongside the other split cards.
  const repTreasuryQuery = useQuery({
    queryKey: ['rep-treasury-balances', companyId],
    queryFn: () => unwrap<RepTreasuryBalance[]>(apiClient.get('/treasury/rep-treasury-balances')),
    enabled: !!companyId && showAccountSplit,
  });
  const repTreasuryTotal = (repTreasuryQuery.data ?? []).reduce((sum, r) => sum + r.balance, 0);
  const repsWithBalance = (repTreasuryQuery.data ?? []).filter((r) => r.balance > 0.005);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  // Branches only exist for Printing Press — Air Conditioning and Stationery also use the
  // transfer feature (see showAccountSplit) but have no branches, so their transfers stay
  // unattributed.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/treasury/cash-movements', {
        companyId,
        movementDate: form.movementDate,
        type: form.type,
        account: form.account,
        amount: Number(form.amount),
        category: form.category,
        description: form.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['expense-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      setModalOpen(false);
      setForm({ movementDate: localToday(), type: 'EXPENSE', account: 'CASH', amount: '0', category: '', description: '' });
    },
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/treasury/cash-movements/transfer', {
        movementDate: transferForm.movementDate,
        fromAccount: transferForm.fromAccount,
        toAccount: transferForm.toAccount,
        amount: Number(transferForm.amount),
        description: transferForm.description || undefined,
        branchId: isPrintingPress ? transferForm.branchId || undefined : undefined,
        fromSalesRepresentativeId:
          transferForm.fromAccount === 'REP_TREASURY' ? transferForm.fromSalesRepresentativeId : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['rep-treasury-balances'] });
      queryClient.invalidateQueries({ queryKey: ['expense-report'] });
      queryClient.invalidateQueries({ queryKey: ['profit-report'] });
      setTransferModalOpen(false);
      setTransferForm(emptyTransferForm());
      setTransferError(null);
    },
    onError: (err: any) => setTransferError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const entries = ledgerQuery.data ?? [];
  // The ledger already combines both treasury accounts (CASH and BANK) into one running total per
  // row (see CashMovementsService.getLedger) — entries[0] (newest first) is that total as of right
  // now, so it's reused directly here rather than re-deriving it from summaryQuery's cashBalance
  // alone, which used to silently ignore every BANK-settled movement.
  const currentBalance = entries.length ? entries[0].runningBalance : 0;
  const filteredEntries = useMemo(
    () => entries.filter((e) => inDateRange(e.date, dateRange)),
    [entries, dateRange],
  );

  // Entries arrive newest-first (buildCashLedger/getLedger both reverse() after accumulating the
  // running balance chronologically) — so the period's closing balance is the FIRST filtered row's
  // runningBalance, not the last.
  const totalReceipts = useMemo(
    () => filteredEntries.reduce((sum, r) => sum + Number(r.debit ?? 0), 0),
    [filteredEntries],
  );
  const totalExpenses = useMemo(
    () => filteredEntries.reduce((sum, r) => sum + Number(r.credit ?? 0), 0),
    [filteredEntries],
  );
  const periodEndingBalance = filteredEntries[0]?.runningBalance ?? currentBalance;

  const columns: Column<CashLedgerEntry>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('treasury.movementType'), accessor: (r) => t(`treasury.movementTypes.${r.movementType}`) },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('treasury.party'), accessor: (r) => r.partyName ?? '—' },
    { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.paymentAccount}`) },
    { header: t('treasury.debit'), accessor: (r) => (r.debit > 0 ? money(r.debit) : '—'), align: 'right' },
    { header: t('treasury.credit'), accessor: (r) => (r.credit > 0 ? money(r.credit) : '—'), align: 'right' },
    { header: t('treasury.description'), accessor: (r) => r.description ?? '—' },
    { header: t('treasury.runningBalance'), accessor: (r) => money(r.runningBalance), align: 'right' },
  ];

  function handlePrint() {
    const previousTitle = document.title;
    document.title = t('treasury.reportTitle');
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    // Toggled just before the html2canvas snapshot so the print-only header/full table/footer
    // (normally display:none on screen) render into the capture — html2canvas reads the live
    // DOM's regular stylesheet, not @media print, so a plain class toggle is what shows them.
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName('تقرير حركة الخزينة', company?.nameAr || company?.nameEn, localToday()),
        'landscape',
      );
    } catch (err) {
      toast.error(t('treasury.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Treasury transactions PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  return (
    <div>
      {showAccountSplit ? (
        // Printing Press / Air Conditioning only — transfer button moves next to the title, and
        // print/PDF stack above the "تسجيل معاملة" button instead of sitting in one action row.
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">{t('nav.treasury')}</h1>
            <Button variant="secondary" onClick={() => setTransferModalOpen(true)}>
              {t('treasury.transferBetweenAccounts')}
            </Button>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handlePrint}>
                {t('common.print')}
              </Button>
              <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
                {t('actions.downloadPdf')}
              </Button>
            </div>
            <Button onClick={() => setModalOpen(true)}>{t('treasury.recordTransaction')}</Button>
          </div>
        </div>
      ) : (
        <PageHeader
          title={t('nav.treasury')}
          actions={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handlePrint}>
                {t('common.print')}
              </Button>
              <Button variant="secondary" onClick={handleDownloadPdf} loading={pdfLoading}>
                {t('actions.downloadPdf')}
              </Button>
              <Button onClick={() => setModalOpen(true)}>{t('treasury.recordTransaction')}</Button>
            </div>
          }
        />
      )}

      {showAccountSplit ? (
        // RTL reading order right-to-left: بنك، كاش، خزينة المندوب، إجمالي — first JSX child
        // renders rightmost.
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('treasury.bankBalance')}</div>
            <div className="mt-1 text-2xl font-semibold">
              {summaryQuery.data ? money(summaryQuery.data.bankBalance) : '—'}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('treasury.cashBalance')}</div>
            <div className="mt-1 text-2xl font-semibold">
              {summaryQuery.data ? money(summaryQuery.data.cashBalance) : '—'}
            </div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('treasury.repTreasuryBalance')}</div>
            <div className="mt-1 text-2xl font-semibold">{money(repTreasuryTotal)}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('treasury.totalBalance')}</div>
            <div className="mt-1 text-2xl font-semibold">{money(currentBalance)}</div>
          </Card>
        </div>
      ) : (
        <Card className="mb-4 print:hidden">
          <div className="text-xs text-[var(--text-muted)]">{t('treasury.totalBalance')}</div>
          <div className="mt-1 text-2xl font-semibold">{money(currentBalance)}</div>
        </Card>
      )}

      <div className="print:hidden">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* On-screen, interactive, paginated — unrelated to print/PDF, which always need the full
          filtered dataset regardless of which page is currently shown here. */}
      <div className="print:hidden">
        <DataTable
          columns={columns}
          data={filteredEntries}
          keyField={(r) => `${r.date}-${r.documentNumber}-${r.debit}-${r.credit}`}
          isLoading={ledgerQuery.isLoading}
        />
      </div>

      <div ref={printRef} className="treasury-print">
        <div className="treasury-print-header">
          <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{t('treasury.reportTitle')}</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>
            {t('treasury.totalBalance')}: {money(currentBalance)} · {t('imports.printDate')}: {localToday()}
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredEntries}
          keyField={(r) => `${r.date}-${r.documentNumber}-${r.debit}-${r.credit}`}
          isLoading={ledgerQuery.isLoading}
          searchable={false}
          pageSize={Math.max(filteredEntries.length, 1)}
        />

        <div className="treasury-print-footer">
          <div>
            {t('treasury.totalReceipts')}: {money(totalReceipts)}
          </div>
          <div>
            {t('treasury.totalExpenses')}: {money(totalExpenses)}
          </div>
          <div>
            {t('treasury.finalBalance')}: {money(periodEndingBalance)}
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('treasury.recordTransactionTitle')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={form.movementDate}
              onChange={(e) => setForm({ ...form, movementDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('treasury.transactionType')}>
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="EXPENSE">{t('treasury.expense')}</option>
              <option value="INCOME">{t('treasury.income')}</option>
            </Select>
          </FormField>
          <FormField label={t('treasury.paymentAccount')}>
            <Select value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })}>
              <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
              <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
            </Select>
          </FormField>
          <FormField label={t('treasury.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('treasury.category')}>
              <Input
                required
                placeholder={t('treasury.categoryPlaceholder') ?? ''}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {showAccountSplit && (
        <Modal
          open={transferModalOpen}
          onClose={() => setTransferModalOpen(false)}
          title={t('treasury.transferModalTitle')}
        >
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              transferMutation.mutate();
            }}
          >
            <FormField label={t('treasury.fromAccount')}>
              <Select
                value={transferForm.fromAccount}
                onChange={(e) => {
                  const next = e.target.value as TransferAccount;
                  setTransferForm((f) => ({
                    ...f,
                    fromAccount: next,
                    toAccount: (f.toAccount as string) === next ? 'CASH' : f.toAccount,
                    fromSalesRepresentativeId: next === 'REP_TREASURY' ? f.fromSalesRepresentativeId : '',
                  }));
                }}
              >
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
                <option value="REP_TREASURY">{t('treasury.paymentAccounts.REP_TREASURY')}</option>
              </Select>
            </FormField>
            <FormField label={t('treasury.toAccount')}>
              <Select
                value={transferForm.toAccount}
                onChange={(e) => setTransferForm((f) => ({ ...f, toAccount: e.target.value as 'CASH' | 'BANK' }))}
              >
                {(['CASH', 'BANK'] as const)
                  .filter((acc) => acc !== transferForm.fromAccount)
                  .map((acc) => (
                    <option key={acc} value={acc}>
                      {t(`treasury.paymentAccounts.${acc}`)}
                    </option>
                  ))}
              </Select>
            </FormField>
            {transferForm.fromAccount === 'REP_TREASURY' && (
              <div className="col-span-2">
                <FormField label={t('treasury.selectRepForSettlement')}>
                  <Select
                    required
                    value={transferForm.fromSalesRepresentativeId}
                    onChange={(e) =>
                      setTransferForm((f) => ({ ...f, fromSalesRepresentativeId: e.target.value }))
                    }
                  >
                    <option value="">{t('actions.selectSalesRep')}</option>
                    {repsWithBalance.map((r) => (
                      <option key={r.salesRepresentativeId} value={r.salesRepresentativeId}>
                        {r.name} — {money(r.balance)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            )}
            <FormField label={t('treasury.amount')}>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={transferForm.amount}
                onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </FormField>
            <FormField label={t('common.date')}>
              <Input
                type="date"
                required
                value={transferForm.movementDate}
                onChange={(e) => setTransferForm((f) => ({ ...f, movementDate: e.target.value }))}
              />
            </FormField>
            {isPrintingPress && (
              <FormField label={t('fields.branch')}>
                <Select
                  required
                  value={transferForm.branchId}
                  onChange={(e) => setTransferForm((f) => ({ ...f, branchId: e.target.value }))}
                >
                  <option value="">{t('actions.selectBranch')}</option>
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
                <Input
                  value={transferForm.description}
                  onChange={(e) => setTransferForm((f) => ({ ...f, description: e.target.value }))}
                />
              </FormField>
            </div>
            {transferError && <p className="col-span-2 text-sm text-red-600">{transferError}</p>}
            <div className="col-span-2 mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setTransferModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={
                  transferMutation.isPending ||
                  (isPrintingPress && !transferForm.branchId) ||
                  (transferForm.fromAccount === 'REP_TREASURY' && !transferForm.fromSalesRepresentativeId)
                }
              >
                {t('common.save')}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
