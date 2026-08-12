import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { PageHeader } from '../../components/ui/PageHeader';
import { Input, Select } from '../../components/ui/Input';
import { DateRange } from '../../components/ui/DateRangeFilter';
import { monthNameOnly } from '../../lib/date-utils';
import { useActiveCompany, useIsPressManagerRestricted } from '../../lib/use-active-company';
import { useAuthStore } from '../../store/auth-store';
import { RepresentativesListTab } from './RepresentativesListTab';
import { RepresentativesReportsTab, ReportsQuarter } from './RepresentativesReportsTab';
import { MyManagerDashboardTab, DashboardQuarter } from './MyManagerDashboardTab';
import { CommissionPayoutsTab } from './CommissionPayoutsTab';

type Tab = 'list' | 'reps' | 'reports' | 'mine' | 'payouts';

interface SalesRepresentative {
  id: string;
  name: string;
}

export function SalesRepresentativesPage() {
  const { t, i18n } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  // Manager-role users in the Press branch never see "صرف الأرباح" — see
  // useIsPressManagerRestricted's own doc comment for the full restriction list this feeds.
  const payoutsTabRestricted = useIsPressManagerRestricted();
  const canViewAll = useAuthStore((s) => s.hasPermission('sales-representatives.view'));
  const [tab, setTab] = useState<Tab>('list');

  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  // "تقارير مدراء الفروع" tab filters — lifted here so they render inline with the tab bar below
  // instead of inside RepresentativesReportsTab's own filter row.
  const [representativeId, setRepresentativeId] = useState('');
  const [reportsYear, setReportsYear] = useState(now.getFullYear());
  const [reportsQuarter, setReportsQuarter] = useState<ReportsQuarter>(currentQuarter as ReportsQuarter);
  const [customRange, setCustomRange] = useState<DateRange>({ from: '', to: '' });

  // "لوحة المدير" tab filters (admin picking a manager to view) — same idea, lifted for the same reason.
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [dashboardYear, setDashboardYear] = useState(now.getFullYear());
  const [dashboardQuarter, setDashboardQuarter] = useState<DashboardQuarter>(currentQuarter as DashboardQuarter);

  // "صرف الأرباح" tab filter — month/year (not quarter), since payouts are recorded and reviewed
  // one calendar month at a time.
  const [payoutsYear, setPayoutsYear] = useState(now.getFullYear());
  const [payoutsMonth, setPayoutsMonth] = useState(now.getMonth() + 1);

  const repsQuery = useQuery({
    queryKey: ['sales-representatives'],
    queryFn: () => unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives')),
    enabled: canViewAll,
  });
  const repOptions = repsQuery.data ?? [];

  const dashboardYearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
    return years;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canViewAll) {
    // Reaching this branch means the logged-in user lacks sales-representatives.view — among the
    // three roles that exist, that's only ever a مدير فرع (Branch Manager) — so the title is always
    // "مدير الفرع", never the admin/manager-facing المناديب/مدراء الفروع list title.
    return (
      <div>
        <PageHeader title={t('nav.branchManager')} />
        <MyManagerDashboardTab />
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'list', label: t(isPrintingPress ? 'salesRepresentativesReports.listTabPress' : 'salesRepresentativesReports.listTab') },
    // Printing Press only, alongside the "مدراء الفروع" tab above — a second, separate list
    // scoped to "مندوب" (field sales agent) accounts, matching that role's own auto-sync into
    // this same sales_representatives table (see UsersService.syncRepRepresentative). Every other
    // company already shows this exact list unfiltered under the "list" tab's own "المناديب"
    // label, so it needs no separate tab there.
    ...(isPrintingPress ? [{ key: 'reps' as Tab, label: t('salesRepresentativesReports.repsTab') }] : []),
    { key: 'reports', label: t(isPrintingPress ? 'salesRepresentativesReports.reportsTabPress' : 'salesRepresentativesReports.reportsTab') },
    // Press keeps "لوحة المدير" (this tab shows a مدير فرع's own dashboard there, a role scoped
    // exclusively to Press); every other company relabels it "لوحة المندوب" since مدير فرع doesn't
    // exist outside Press and this same tab there is really a مندوب's own dashboard instead.
    { key: 'mine', label: t(isPrintingPress ? 'managerDashboard.tabLabelPress' : 'managerDashboard.tabLabel') },
    // Branch-manager commission payouts only make sense for the Printing Press, same gating as
    // every other branch/commission feature on this page — further restricted away from a
    // Manager-role user in that same branch (see useIsPressManagerRestricted).
    ...(isPrintingPress && !payoutsTabRestricted
      ? [{ key: 'payouts' as Tab, label: t('salesRepresentativesReports.payoutsTab') }]
      : []),
  ];

  return (
    <div>
      <PageHeader title={t(isPrintingPress ? 'nav.salesRepresentativesPress' : 'nav.salesRepresentatives')} />

      {/* Single horizontal line: tabs on one end, year/quarter centered between them and the
          manager-select, manager-select last — order always tabs -> year/quarter -> manager. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 text-sm">
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

        {tab === 'reports' && (
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Input
                type="number"
                disabled={!!customRange.from && !!customRange.to}
                value={reportsYear}
                onChange={(e) => setReportsYear(Number(e.target.value) || now.getFullYear())}
              />
            </div>
            <div className="w-56">
              <Select
                disabled={!!customRange.from && !!customRange.to}
                value={reportsQuarter}
                onChange={(e) => setReportsQuarter(Number(e.target.value) as ReportsQuarter)}
              >
                <option value={1}>{t('partners.q1')}</option>
                <option value={2}>{t('partners.q2')}</option>
                <option value={3}>{t('partners.q3')}</option>
                <option value={4}>{t('partners.q4')}</option>
                <option value={0}>{t('partners.fullYear')}</option>
              </Select>
            </div>
          </div>
        )}

        {tab === 'mine' && (
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Select value={dashboardYear} onChange={(e) => setDashboardYear(Number(e.target.value))}>
                {dashboardYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-56">
              <Select value={dashboardQuarter} onChange={(e) => setDashboardQuarter(Number(e.target.value) as DashboardQuarter)}>
                <option value={1}>{t('partners.q1')}</option>
                <option value={2}>{t('partners.q2')}</option>
                <option value={3}>{t('partners.q3')}</option>
                <option value={4}>{t('partners.q4')}</option>
              </Select>
            </div>
          </div>
        )}

        {tab === 'reports' && (
          <div className="w-64">
            <Select value={representativeId} onChange={(e) => setRepresentativeId(e.target.value)}>
              <option value="">
                {t(isPrintingPress ? 'salesRepresentativesReports.allRepresentativesPress' : 'salesRepresentativesReports.allRepresentatives')}
              </option>
              {repOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {tab === 'mine' && (
          <div className="w-64">
            <Select value={selectedManagerId} onChange={(e) => setSelectedManagerId(e.target.value)}>
              <option value="">{t('managerDashboard.selectManagerPlaceholder')}</option>
              {repOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {tab === 'payouts' && (
          <div className="flex items-center gap-2">
            <div className="w-24">
              <Select value={payoutsYear} onChange={(e) => setPayoutsYear(Number(e.target.value))}>
                {dashboardYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select value={payoutsMonth} onChange={(e) => setPayoutsMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {monthNameOnly(m, i18n.language)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}
      </div>

      {tab === 'list' && <RepresentativesListTab roleNameFilter={isPrintingPress ? 'مدير فرع' : undefined} />}
      {tab === 'reps' && <RepresentativesListTab roleNameFilter="مندوب" />}
      {tab === 'reports' && (
        <RepresentativesReportsTab
          representativeId={representativeId}
          year={reportsYear}
          quarter={reportsQuarter}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      )}
      {tab === 'mine' && (
        <MyManagerDashboardTab
          controlled={{ selectedRepId: selectedManagerId, year: dashboardYear, quarter: dashboardQuarter, repOptions }}
        />
      )}
      {tab === 'payouts' && !payoutsTabRestricted && <CommissionPayoutsTab year={payoutsYear} month={payoutsMonth} />}
    </div>
  );
}
