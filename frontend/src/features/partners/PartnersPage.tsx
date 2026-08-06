import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
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

type Tab = 'contributions' | 'assets' | 'dividends';
/** 1-4 for a quarter, 0 for the full calendar year. */
type Quarter = 0 | 1 | 2 | 3 | 4;

interface Summary {
  cashBalance: number;
  bankBalance: number;
  inventoryValue: number;
}

interface Transaction {
  id: string;
  date: string;
  documentNumber: string;
  amount: number;
  account?: 'CASH' | 'BANK';
  branchId?: string | null;
  description: string | null;
  partnerId: string | null;
  partnerName: string;
  createdByName: string;
}

interface AvailableDividends {
  netProfit: number;
  alreadyDistributed: number;
  available: number;
}

interface PartnerBalance {
  partnerId: string;
  name: string;
  sharePercentage: number;
  balance: number;
}

interface PartnersBalances {
  balances: PartnerBalance[];
  total: number;
}

interface PartnerMaxDividend {
  sharePercentage: number;
  available: number;
  alreadyPaidToPartner: number;
  maxAmount: number;
}

function money(n: number): string {
  return formatAmount(n);
}

/** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31 — mirrors the backend's quarterDateRange(). `quarter` 0 means the full year (Jan1–Dec31). */
function quarterDateRange(year: number, quarter: Quarter): { dateFrom: string; dateTo: string } {
  if (quarter === 0) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    dateFrom: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function PartnersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [tab, setTab] = useState<Tab>('contributions');
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];
  const { isPrintingPress } = useActiveCompany();

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  // Same query key as the Dashboard — one cache entry, so this screen and the Dashboard card
  // always reflect the exact same number, live.
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', companyId],
    queryFn: () => unwrap<Summary>(apiClient.get('/dashboard/summary', { params: { companyId } })),
    enabled: !!companyId,
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'contributions', label: t('partners.contributions') },
    { key: 'assets', label: t('partners.assets') },
    { key: 'dividends', label: t('partners.dividends') },
  ];

  // --- Contributions -------------------------------------------------------------
  const [contribModalOpen, setContribModalOpen] = useState(false);
  const [contribForm, setContribForm] = useState({
    movementDate: localToday(),
    partnerId: '',
    amount: '0',
    description: '',
    account: 'CASH' as 'CASH' | 'BANK',
    branchId: '',
  });
  const [contribPartnerFilter, setContribPartnerFilter] = useState('');

  const contributionsQuery = useQuery({
    queryKey: ['capital-injections', companyId, contribPartnerFilter],
    queryFn: () =>
      unwrap<Transaction[]>(
        apiClient.get('/treasury/capital-injections', {
          params: { companyId, partnerId: contribPartnerFilter || undefined },
        }),
      ),
    enabled: !!companyId && tab === 'contributions',
  });

  // Also backs the Dividends tab's "filter by partner" dropdown and the combined print/PDF
  // report's partner balance table — not gated to a specific tab for that last reason.
  const partnersBalancesQuery = useQuery({
    queryKey: ['partners-balances', companyId],
    queryFn: () => unwrap<PartnersBalances>(apiClient.get('/treasury/partners-balances', { params: { companyId } })),
    enabled: !!companyId,
  });

  const [editingContributionId, setEditingContributionId] = useState<string | null>(null);
  const [editContribForm, setEditContribForm] = useState({
    movementDate: localToday(),
    partnerId: '',
    amount: '0',
    description: '',
    account: 'CASH' as 'CASH' | 'BANK',
    branchId: '',
  });

  const contribAmount = Number(contribForm.amount || 0);

  // A contribution is one partner's own money, credited in full to their own balance — never
  // split across the others by ownership share (that's what a dividend payout does, the opposite
  // direction). No preview step needed: the partner and amount typed in are exactly what gets
  // recorded.
  const addContributionMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/treasury/capital-injections', {
        companyId,
        movementDate: contribForm.movementDate,
        partnerId: contribForm.partnerId,
        amount: contribAmount,
        description: contribForm.description || undefined,
        account: isPrintingPress ? contribForm.account : undefined,
        branchId: isPrintingPress ? contribForm.branchId || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['capital-injections'] });
      queryClient.invalidateQueries({ queryKey: ['partners-balances'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      setContribModalOpen(false);
      setContribForm({ movementDate: localToday(), partnerId: '', amount: '0', description: '', account: 'CASH', branchId: '' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? String(err?.message ?? err)),
  });

  // Every balance built from these rows (per-partner balances, the Partners' Balance dashboard
  // KPI, the Treasury ledger) is a live SUM over cash_movements, so invalidating these queries
  // after an edit/delete is the entire sync step — nothing else needs to be touched.
  const invalidateContributionRelatedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['capital-injections'] });
    queryClient.invalidateQueries({ queryKey: ['partners-balances'] });
    queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
  };

  const updateContributionMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(
        `/treasury/capital-injections/${editingContributionId}`,
        {
          movementDate: editContribForm.movementDate,
          partnerId: editContribForm.partnerId,
          amount: Number(editContribForm.amount),
          description: editContribForm.description || undefined,
          account: isPrintingPress ? editContribForm.account : undefined,
          branchId: isPrintingPress ? editContribForm.branchId || undefined : undefined,
        },
        { params: { companyId } },
      ),
    onSuccess: () => {
      invalidateContributionRelatedQueries();
      setEditingContributionId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? String(err?.message ?? err)),
  });

  const deleteContributionMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/treasury/capital-injections/${id}`, { params: { companyId } }),
    onSuccess: () => invalidateContributionRelatedQueries(),
    onError: (err: any) => toast.error(err?.response?.data?.message ?? String(err?.message ?? err)),
  });

  function openEditContribution(r: Transaction) {
    setEditingContributionId(r.id);
    setEditContribForm({
      movementDate: r.date,
      partnerId: r.partnerId ?? '',
      amount: String(r.amount),
      description: r.description ?? '',
      account: r.account ?? 'CASH',
      branchId: r.branchId ?? '',
    });
  }

  async function handleDeleteContribution(r: Transaction) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: r.documentNumber }) });
    if (ok) deleteContributionMutation.mutate(r.id);
  }

  const partnerBalanceColumns: Column<PartnerBalance>[] = [
    { header: t('fields.partnerName'), accessor: (r) => r.name },
    { header: t('fields.sharePercentage'), accessor: (r) => `${formatAmount(r.sharePercentage)}%`, align: 'right' },
    { header: t('treasury.amount'), accessor: (r) => money(r.balance), align: 'right' },
  ];

  const contributionColumns: Column<Transaction>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('fields.partnerName'), accessor: (r) => r.partnerName },
    { header: t('treasury.amount'), accessor: (r) => money(r.amount), align: 'right' },
    ...(isPrintingPress
      ? [
          {
            header: t('fields.depositDestination'),
            accessor: (r: Transaction) => t(`treasury.paymentAccounts.${r.account ?? 'CASH'}`),
          } as Column<Transaction>,
        ]
      : []),
    { header: t('table.description'), accessor: (r) => r.description ?? '—' },
    { header: t('suppliers.createdBy'), accessor: (r) => r.createdByName },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button type="button" className="text-primary-600 hover:underline" onClick={() => openEditContribution(r)}>
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteContributionMutation.isPending}
            onClick={() => handleDeleteContribution(r)}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
    },
  ];

  // --- Dividends -------------------------------------------------------------------
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState<Quarter>((Math.floor(now.getMonth() / 3) + 1) as Quarter);
  const [dividendModalOpen, setDividendModalOpen] = useState(false);
  const [dividendForm, setDividendForm] = useState({ partnerId: '', movementDate: localToday(), amount: '0', description: '', branchId: '' });
  const [dividendPartnerFilter, setDividendPartnerFilter] = useState('');

  const { dateFrom, dateTo } = useMemo(() => quarterDateRange(year, quarter), [year, quarter]);

  // Not gated to tab === 'dividends': the combined print/PDF report always needs this section's
  // data regardless of which tab is actually active on screen when the user clicks print/export.
  const availableQuery = useQuery({
    queryKey: ['dividends-available', companyId, year, quarter],
    queryFn: () =>
      unwrap<AvailableDividends>(
        apiClient.get('/treasury/dividends/available', { params: { companyId, year, quarter } }),
      ),
    enabled: !!companyId,
  });

  // The customers' total outstanding balance as it stood at the end of the selected quarter/year
  // (asOfDate = dateTo) — not today's live figure — so it moves with the same period filter as
  // every other card on this tab.
  const outstandingTotalQuery = useQuery({
    queryKey: ['customers-outstanding-total', companyId, dateTo],
    queryFn: () =>
      unwrap<number>(apiClient.get('/customers/outstanding-total', { params: { companyId, asOfDate: dateTo } })),
    enabled: !!companyId,
  });

  const dividendsQuery = useQuery({
    queryKey: ['dividends', companyId, dateFrom, dateTo, dividendPartnerFilter],
    queryFn: () =>
      unwrap<Transaction[]>(
        apiClient.get('/treasury/dividends', {
          params: { companyId, dateFrom, dateTo, partnerId: dividendPartnerFilter || undefined },
        }),
      ),
    enabled: !!companyId && tab === 'dividends',
  });

  // The print/PDF report always shows every partner's dividend history for the selected period,
  // independent of whatever per-partner filter is currently applied on the Dividends tab on
  // screen — sharing dividendsQuery's cache entry for free whenever that filter is empty anyway.
  const printDividendsQuery = useQuery({
    queryKey: ['dividends', companyId, dateFrom, dateTo, ''],
    queryFn: () =>
      unwrap<Transaction[]>(apiClient.get('/treasury/dividends', { params: { companyId, dateFrom, dateTo } })),
    enabled: !!companyId,
  });

  const available = availableQuery.data?.available ?? 0;
  const dividendAmount = Number(dividendForm.amount || 0);

  // Fetched from the same cap the backend will actually enforce, so the read-only max-allowed
  // field and the amount validation below it can never disagree with what gets recorded on save.
  const partnerMaxQuery = useQuery({
    queryKey: ['dividend-partner-max', companyId, year, quarter, dividendForm.partnerId],
    queryFn: () =>
      unwrap<PartnerMaxDividend>(
        apiClient.get('/treasury/dividends/partner-max', {
          params: { companyId, year, quarter, partnerId: dividendForm.partnerId },
        }),
      ),
    enabled: dividendModalOpen && !!companyId && !!dividendForm.partnerId,
    networkMode: 'always',
    retry: false,
  });

  const partnerMaxAmount = dividendForm.partnerId ? (partnerMaxQuery.data?.maxAmount ?? 0) : null;
  const exceedsPartnerMax = partnerMaxAmount !== null && dividendAmount > partnerMaxAmount;

  const distributeMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/treasury/dividends', {
        companyId,
        partnerId: dividendForm.partnerId,
        movementDate: dividendForm.movementDate,
        amount: dividendAmount,
        year,
        quarter,
        description: dividendForm.description || undefined,
        branchId: isPrintingPress ? dividendForm.branchId || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dividends-available'] });
      queryClient.invalidateQueries({ queryKey: ['dividend-partner-max'] });
      queryClient.invalidateQueries({ queryKey: ['dividends'] });
      queryClient.invalidateQueries({ queryKey: ['partners-balances'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      setDividendModalOpen(false);
      setDividendForm({ partnerId: '', movementDate: localToday(), amount: '0', description: '', branchId: '' });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? String(err?.message ?? err)),
  });

  const dividendColumns: Column<Transaction>[] = [
    { header: t('common.date'), accessor: (r) => r.date },
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('fields.partnerName'), accessor: (r) => r.partnerName },
    { header: t('treasury.amount'), accessor: (r) => money(r.amount), align: 'right' },
    { header: t('table.description'), accessor: (r) => r.description ?? '—' },
    { header: t('suppliers.createdBy'), accessor: (r) => r.createdByName },
  ];

  const selectedPartnerPayoutTotal = (dividendsQuery.data ?? []).reduce((sum, r) => sum + r.amount, 0);
  const printSelectedPartnerPayoutTotal = (printDividendsQuery.data ?? []).reduce((sum, r) => sum + r.amount, 0);

  // --- Assets ------------------------------------------------------------------------
  // The treasury has two accounts (CASH and BANK) — same reasoning as DashboardPage.tsx's
  // treasuryBalance: showing cashBalance alone silently drops every BANK-settled movement from
  // both this line item and the total.
  const treasuryBalance = (summaryQuery.data?.cashBalance ?? 0) + (summaryQuery.data?.bankBalance ?? 0);
  const totalAssets = (summaryQuery.data?.inventoryValue ?? 0) + treasuryBalance;

  function handlePrint() {
    const previousTitle = document.title;
    document.title = t('partners.reportTitle');
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    // Toggled just before the html2canvas snapshot so the print-only combined report (normally
    // display:none on screen) renders into the capture — html2canvas reads the live DOM's regular
    // stylesheet, not @media print, so a plain class toggle is what actually shows it.
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidthMm = pdf.internal.pageSize.getWidth();
      const pageHeightMm = pdf.internal.pageSize.getHeight();

      // Fit-to-page, not fit-to-width: this report must land on a single A4 page, so whichever
      // dimension (width or height) is the tighter constraint decides the scale, and the image is
      // centered in whatever axis ends up with room to spare.
      const widthConstrainedHeightMm = (canvas.height * pageWidthMm) / canvas.width;
      let imgWidthMm = pageWidthMm;
      let imgHeightMm = widthConstrainedHeightMm;
      if (widthConstrainedHeightMm > pageHeightMm) {
        imgHeightMm = pageHeightMm;
        imgWidthMm = (canvas.width * pageHeightMm) / canvas.height;
      }
      const offsetXMm = (pageWidthMm - imgWidthMm) / 2;
      const offsetYMm = (pageHeightMm - imgHeightMm) / 2;

      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', offsetXMm, offsetYMm, imgWidthMm, imgHeightMm);
      pdf.save(buildPdfFileName('تقرير الشركاء والمساهمات', company?.nameAr || company?.nameEn, localToday()));
    } catch (err) {
      toast.error(t('partners.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Partners report PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t('nav.partners')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handlePrint}>
              {t('partners.printReport')}
            </Button>
            <Button variant="secondary" onClick={handleDownloadPdf} disabled={pdfLoading}>
              {t('partners.exportPdf')}
            </Button>
          </div>
        }
      />

      <div className="print:hidden">
      <div className="mb-4 flex gap-2 text-sm">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            className={`rounded-lg px-3 py-1.5 ${tab === tb.key ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
            onClick={() => setTab(tb.key)}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'contributions' && (
        <div>
          <Card className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-[var(--text-muted)]">{t('partners.totalContribution')}</div>
                <div className="mt-1 text-2xl font-semibold">{money(partnersBalancesQuery.data?.total ?? 0)}</div>
              </div>
              <Button onClick={() => setContribModalOpen(true)}>{t('partners.addContribution')}</Button>
            </div>
          </Card>

          <h3 className="mb-2 font-semibold">{t('partners.perPartnerBalances')}</h3>
          <DataTable
            columns={partnerBalanceColumns}
            data={partnersBalancesQuery.data?.balances ?? []}
            keyField={(r) => r.partnerId}
            isLoading={partnersBalancesQuery.isLoading}
            searchable={false}
          />

          <div className="mb-3 mt-6 flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-semibold">{t('partners.contributionHistory')}</h3>
            <FormField label={t('partners.filterByPartner')}>
              <Select value={contribPartnerFilter} onChange={(e) => setContribPartnerFilter(e.target.value)}>
                <option value="">{t('common.all')}</option>
                {(partnersBalancesQuery.data?.balances ?? []).map((p) => (
                  <option key={p.partnerId} value={p.partnerId}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <DataTable
            columns={contributionColumns}
            data={contributionsQuery.data ?? []}
            keyField={(r) => r.id}
            isLoading={contributionsQuery.isLoading}
            searchable={false}
          />
        </div>
      )}

      {tab === 'assets' && (
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('partners.totalAssets')}</div>
          <div className="mt-1 text-2xl font-semibold">{money(totalAssets)}</div>
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between border-b border-[var(--border)] py-1">
              <span className="text-[var(--text-muted)]">{t('dashboard.inventoryValue')}</span>
              <span>{money(summaryQuery.data?.inventoryValue ?? 0)}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--text-muted)]">{t('dashboard.cashBalance')}</span>
              <span>{money(treasuryBalance)}</span>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">{t('partners.assetsFormula')}</p>
        </Card>
      )}

      {tab === 'dividends' && (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FormField label={t('salesReport.year')}>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} />
            </FormField>
            <FormField label={t('partners.quarter')}>
              <Select value={quarter} onChange={(e) => setQuarter(Number(e.target.value) as Quarter)}>
                <option value={1}>{t('partners.q1')}</option>
                <option value={2}>{t('partners.q2')}</option>
                <option value={3}>{t('partners.q3')}</option>
                <option value={4}>{t('partners.q4')}</option>
                <option value={0}>{t('partners.fullYear')}</option>
              </Select>
            </FormField>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('partners.netProfitForQuarter')}</div>
              <div className="mt-1 text-xl font-semibold">{money(availableQuery.data?.netProfit ?? 0)}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('partners.alreadyDistributed')}</div>
              <div className="mt-1 text-xl font-semibold">{money(availableQuery.data?.alreadyDistributed ?? 0)}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('partners.availableToDistribute')}</div>
              <div className="mt-1 text-xl font-semibold text-green-600">{money(available)}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('partners.outstandingBalances')}</div>
              <div className="mt-1 text-xl font-semibold text-red-600">{money(outstandingTotalQuery.data ?? 0)}</div>
            </Card>
          </div>

          <div className="mb-3 flex justify-end">
            <Button onClick={() => setDividendModalOpen(true)} disabled={available <= 0}>
              {t('partners.distributeDividends')}
            </Button>
          </div>

          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-semibold">{t('partners.dividendHistory')}</h3>
            <FormField label={t('partners.filterByPartner')}>
              <Select value={dividendPartnerFilter} onChange={(e) => setDividendPartnerFilter(e.target.value)}>
                <option value="">{t('common.all')}</option>
                {(partnersBalancesQuery.data?.balances ?? []).map((p) => (
                  <option key={p.partnerId} value={p.partnerId}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <Card className="mb-4">
            <div className="text-xs text-[var(--text-muted)]">{t('partners.selectedPartnerPayoutTotal')}</div>
            <div className="mt-1 text-xl font-semibold">{money(selectedPartnerPayoutTotal)}</div>
          </Card>

          <DataTable
            columns={dividendColumns}
            data={dividendsQuery.data ?? []}
            keyField={(r) => r.id}
            isLoading={dividendsQuery.isLoading}
            searchable={false}
          />
        </div>
      )}
      </div>

      {/* Print/PDF always combine the partner-balance table + dividends summary/history in one
          document, in that order, regardless of which tab is active on screen — and deliberately
          excluding the contributions log table and the Assets tab entirely, per spec. Hidden here
          by default and only shown via @media print / .pdf-export-mode (see index.css). */}
      <div ref={printRef} className="partners-report-print">
        <div className="partners-report-print-header">
          <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
          <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{t('partners.reportTitle')}</div>
          <div style={{ fontSize: 11, color: '#4b5563' }}>{t('imports.printDate')}: {localToday()}</div>
          <div className="partners-report-print-total-card">
            {t('partners.totalContribution')}: {money(partnersBalancesQuery.data?.total ?? 0)}
          </div>
        </div>

        <div className="partners-report-print-section">
          <div className="partners-report-print-section-title">{t('partners.perPartnerBalances')}</div>
          <table className="app-table">
            <thead>
              <tr>
                <th>{t('fields.partnerName')}</th>
                <th>{t('fields.sharePercentage')}</th>
                <th>{t('treasury.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {(partnersBalancesQuery.data?.balances ?? []).map((r) => (
                <tr key={r.partnerId}>
                  <td>{r.name}</td>
                  <td>{formatAmount(r.sharePercentage)}%</td>
                  <td>{money(r.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="partners-report-print-section">
          <div className="partners-report-print-section-title">{t('partners.dividends')}</div>
          <div className="partners-report-print-summary">
            <div>
              {t('partners.netProfitForQuarter')}: {money(availableQuery.data?.netProfit ?? 0)}
            </div>
            <div>
              {t('partners.alreadyDistributed')}: {money(availableQuery.data?.alreadyDistributed ?? 0)}
            </div>
            <div>
              {t('partners.availableToDistribute')}: {money(available)}
            </div>
            <div>
              {t('partners.outstandingBalances')}: {money(outstandingTotalQuery.data ?? 0)}
            </div>
          </div>
          <table className="app-table">
            <thead>
              <tr>
                <th>{t('common.date')}</th>
                <th>{t('table.documentNumber')}</th>
                <th>{t('fields.partnerName')}</th>
                <th>{t('treasury.amount')}</th>
                <th>{t('table.description')}</th>
              </tr>
            </thead>
            <tbody>
              {(printDividendsQuery.data ?? []).map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{r.documentNumber}</td>
                  <td>{r.partnerName}</td>
                  <td>{money(r.amount)}</td>
                  <td>{r.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="partners-report-print-total">
            {t('partners.selectedPartnerPayoutTotal')}: {money(printSelectedPartnerPayoutTotal)}
          </div>
        </div>
      </div>

      <Modal open={contribModalOpen} onClose={() => setContribModalOpen(false)} title={t('partners.addContribution')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            addContributionMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('fields.partnerName')}>
              <Select
                required
                value={contribForm.partnerId}
                onChange={(e) => setContribForm({ ...contribForm, partnerId: e.target.value })}
              >
                <option value="">{t('actions.selectPartner')}</option>
                {(partnersBalancesQuery.data?.balances ?? []).map((p) => (
                  <option key={p.partnerId} value={p.partnerId}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={contribForm.movementDate}
              onChange={(e) => setContribForm({ ...contribForm, movementDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('treasury.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={contribForm.amount}
              onChange={(e) => setContribForm({ ...contribForm, amount: e.target.value })}
            />
          </FormField>
          {isPrintingPress && (
            <FormField label={t('fields.depositDestination')}>
              <Select
                value={contribForm.account}
                onChange={(e) => setContribForm({ ...contribForm, account: e.target.value as 'CASH' | 'BANK' })}
              >
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
              </Select>
            </FormField>
          )}
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select
                required
                value={contribForm.branchId}
                onChange={(e) => setContribForm({ ...contribForm, branchId: e.target.value })}
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
                value={contribForm.description}
                onChange={(e) => setContribForm({ ...contribForm, description: e.target.value })}
              />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setContribModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                contribAmount <= 0 ||
                !contribForm.partnerId ||
                (isPrintingPress && !contribForm.branchId) ||
                addContributionMutation.isPending
              }
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingContributionId} onClose={() => setEditingContributionId(null)} title={t('common.edit')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateContributionMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('fields.partnerName')}>
              <Select
                required
                value={editContribForm.partnerId}
                onChange={(e) => setEditContribForm({ ...editContribForm, partnerId: e.target.value })}
              >
                <option value="">{t('actions.selectPartner')}</option>
                {(partnersBalancesQuery.data?.balances ?? []).map((p) => (
                  <option key={p.partnerId} value={p.partnerId}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={editContribForm.movementDate}
              onChange={(e) => setEditContribForm({ ...editContribForm, movementDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('treasury.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={editContribForm.amount}
              onChange={(e) => setEditContribForm({ ...editContribForm, amount: e.target.value })}
            />
          </FormField>
          {isPrintingPress && (
            <FormField label={t('fields.depositDestination')}>
              <Select
                value={editContribForm.account}
                onChange={(e) => setEditContribForm({ ...editContribForm, account: e.target.value as 'CASH' | 'BANK' })}
              >
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
              </Select>
            </FormField>
          )}
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select
                required
                value={editContribForm.branchId}
                onChange={(e) => setEditContribForm({ ...editContribForm, branchId: e.target.value })}
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
                value={editContribForm.description}
                onChange={(e) => setEditContribForm({ ...editContribForm, description: e.target.value })}
              />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingContributionId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={(isPrintingPress && !editContribForm.branchId) || updateContributionMutation.isPending}
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={dividendModalOpen} onClose={() => setDividendModalOpen(false)} title={t('partners.distributeDividends')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            distributeMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('fields.partnerName')}>
              <Select
                required
                value={dividendForm.partnerId}
                onChange={(e) => setDividendForm({ ...dividendForm, partnerId: e.target.value, amount: '0' })}
              >
                <option value="">{t('actions.selectPartner')}</option>
                {(partnersBalancesQuery.data?.balances ?? []).map((p) => (
                  <option key={p.partnerId} value={p.partnerId}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          {dividendForm.partnerId && (
            <div className="col-span-2">
              <FormField label={t('partners.maxAllowedToDistribute')}>
                <Input
                  disabled
                  value={
                    partnerMaxQuery.isLoading
                      ? t('common.loading') ?? ''
                      : partnerMaxQuery.isError
                        ? ((partnerMaxQuery.error as any)?.response?.data?.message ??
                          String((partnerMaxQuery.error as any)?.message ?? partnerMaxQuery.error))
                        : money(partnerMaxAmount ?? 0)
                  }
                />
              </FormField>
            </div>
          )}

          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={dividendForm.movementDate}
              onChange={(e) => setDividendForm({ ...dividendForm, movementDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('partners.distributeAmount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              disabled={!dividendForm.partnerId}
              value={dividendForm.amount}
              onChange={(e) => setDividendForm({ ...dividendForm, amount: e.target.value })}
            />
          </FormField>

          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select
                required
                value={dividendForm.branchId}
                onChange={(e) => setDividendForm({ ...dividendForm, branchId: e.target.value })}
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
                value={dividendForm.description}
                onChange={(e) => setDividendForm({ ...dividendForm, description: e.target.value })}
              />
            </FormField>
          </div>
          {exceedsPartnerMax && (
            <div className="col-span-2 text-xs text-red-600">
              {t('partners.exceedsPartnerMax', { max: money(partnerMaxAmount ?? 0) })}
            </div>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDividendModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={
                distributeMutation.isPending ||
                !dividendForm.partnerId ||
                dividendAmount <= 0 ||
                exceedsPartnerMax ||
                (isPrintingPress && !dividendForm.branchId)
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
