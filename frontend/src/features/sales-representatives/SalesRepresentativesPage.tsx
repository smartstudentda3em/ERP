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

type MainSection = 'managers' | 'reps';
type ManagerSubTab = 'list' | 'reports' | 'mine' | 'payouts';
type RepSubTab = 'list' | 'reports' | 'mine';

interface SalesRepresentative {
  id: string;
  name: string;
}

export function SalesRepresentativesPage() {
  const { t, i18n } = useTranslation();
  const { isPrintingPress, isStationery, isAirConditioning } = useActiveCompany();
  // Every company now has its own مدير فرع variant (see backend/src/database/seeds/run-seed.ts's
  // BRANCH_MANAGER_ROLE_DEFS) — this picks the right one so the "مدراء الأفرع" section below
  // filters correctly no matter which company is active.
  const branchManagerRoleName = isStationery
    ? 'مدير فرع - القرطاسية'
    : isAirConditioning
      ? 'مدير فرع - التكييفات'
      : 'مدير فرع';
  // Manager-role users in the Press branch never see "صرف الأرباح" — see
  // useIsPressManagerRestricted's own doc comment for the full restriction list this feeds.
  const payoutsTabRestricted = useIsPressManagerRestricted();
  const canViewAll = useAuthStore((s) => s.hasPermission('sales-representatives.view'));

  // Top level: "مدراء الأفرع" vs "المناديب" — each keeps its own independent sub-tab so switching
  // sections and back doesn't reset where the user was.
  const [mainSection, setMainSection] = useState<MainSection>('managers');
  const [managerSubTab, setManagerSubTab] = useState<ManagerSubTab>('list');
  const [repSubTab, setRepSubTab] = useState<RepSubTab>('list');

  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

  // "تقارير مدراء الفروع"/"تقارير المناديب" filters — lifted here so they render inline with the
  // sub-tab bar below instead of inside RepresentativesReportsTab's own filter row. Shared by both
  // sections since only one reports sub-tab is ever visible at a time.
  const [representativeId, setRepresentativeId] = useState('');
  const [reportsYear, setReportsYear] = useState(now.getFullYear());
  const [reportsQuarter, setReportsQuarter] = useState<ReportsQuarter>(currentQuarter as ReportsQuarter);
  const [customRange, setCustomRange] = useState<DateRange>({ from: '', to: '' });

  // "لوحة المدير"/"لوحة المندوب" filters (admin picking who to view) — same idea, lifted for the
  // same reason, also shared since only one "mine" sub-tab is ever visible at a time.
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [dashboardYear, setDashboardYear] = useState(now.getFullYear());
  const [dashboardQuarter, setDashboardQuarter] = useState<DashboardQuarter>(currentQuarter as DashboardQuarter);

  // "صرف الأرباح" filter — month/year (not quarter), since payouts are recorded and reviewed one
  // calendar month at a time. Managers section only.
  const [payoutsYear, setPayoutsYear] = useState(now.getFullYear());
  const [payoutsMonth, setPayoutsMonth] = useState(now.getMonth() + 1);

  // Two role-scoped lists instead of one shared unfiltered list — keeps the "تقارير"/"لوحة" picker
  // under "مدراء الأفرع" showing only managers, and the one under "المناديب" showing only reps,
  // rather than mixing both roles into a single dropdown.
  const managerRepsQuery = useQuery({
    queryKey: ['sales-representatives', branchManagerRoleName],
    queryFn: () =>
      unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives', { params: { roleName: branchManagerRoleName } })),
    enabled: canViewAll,
  });
  const repRepsQuery = useQuery({
    queryKey: ['sales-representatives', 'مندوب'],
    queryFn: () => unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives', { params: { roleName: 'مندوب' } })),
    enabled: canViewAll,
  });
  const managerRepOptions = managerRepsQuery.data ?? [];
  const repRepOptions = repRepsQuery.data ?? [];
  const activeRepOptions = mainSection === 'managers' ? managerRepOptions : repRepOptions;

  const dashboardYearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) years.push(y);
    return years;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canViewAll) {
    // Reaching this branch means the logged-in user lacks sales-representatives.view — among the
    // three roles that exist, that's only ever a مدير فرع (Branch Manager) — so the title is always
    // "مدير الفرع", never the admin/manager-facing المناديب/مدراء الأفرع page title.
    return (
      <div>
        <PageHeader title={t('nav.branchManager')} />
        <MyManagerDashboardTab />
      </div>
    );
  }

  const managerSubTabs: { key: ManagerSubTab; label: string }[] = [
    { key: 'list', label: t('salesRepresentativesReports.listTabPress') },
    { key: 'reports', label: t('salesRepresentativesReports.reportsTabPress') },
    { key: 'mine', label: t('managerDashboard.tabLabelPress') },
    // Branch-manager commission payouts only make sense for the Printing Press — further
    // restricted away from a Manager-role user in that same branch (see useIsPressManagerRestricted).
    ...(isPrintingPress && !payoutsTabRestricted
      ? [{ key: 'payouts' as ManagerSubTab, label: t('salesRepresentativesReports.payoutsTab') }]
      : []),
  ];
  const repSubTabs: { key: RepSubTab; label: string }[] = [
    { key: 'list', label: t('salesRepresentativesReports.repsTab') },
    { key: 'reports', label: t('salesRepresentativesReports.reportsTab') },
    { key: 'mine', label: t('managerDashboard.tabLabel') },
  ];

  const activeSubTab = mainSection === 'managers' ? managerSubTab : repSubTab;

  return (
    <div>
      <PageHeader title={t('nav.salesRepresentatives')} />

      {/* Level 1: مدراء الأفرع / المناديب */}
      <div className="mb-4 flex gap-2 border-b border-[var(--border)] text-base font-semibold">
        <button
          className={`-mb-px border-b-2 px-4 py-2 ${
            mainSection === 'managers' ? 'border-primary-600 text-primary-600' : 'border-transparent text-[var(--text-muted)]'
          }`}
          onClick={() => setMainSection('managers')}
        >
          {t('salesRepresentativesReports.listTabPress')}
        </button>
        <button
          className={`-mb-px border-b-2 px-4 py-2 ${
            mainSection === 'reps' ? 'border-primary-600 text-primary-600' : 'border-transparent text-[var(--text-muted)]'
          }`}
          onClick={() => setMainSection('reps')}
        >
          {t('salesRepresentativesReports.repsTab')}
        </button>
      </div>

      {/* Level 2: the sub-tabs belonging only to the currently selected section above */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-2 text-sm">
          {(mainSection === 'managers' ? managerSubTabs : repSubTabs).map((tb) => (
            <button
              key={tb.key}
              className={`rounded-lg px-3 py-1.5 ${
                activeSubTab === tb.key ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'
              }`}
              onClick={() =>
                mainSection === 'managers'
                  ? setManagerSubTab(tb.key as ManagerSubTab)
                  : setRepSubTab(tb.key as RepSubTab)
              }
            >
              {tb.label}
            </button>
          ))}
        </div>

        {activeSubTab === 'reports' && (
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

        {activeSubTab === 'mine' && (
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

        {activeSubTab === 'reports' && (
          <div className="w-64">
            <Select value={representativeId} onChange={(e) => setRepresentativeId(e.target.value)}>
              <option value="">
                {t(mainSection === 'managers' ? 'salesRepresentativesReports.allRepresentativesPress' : 'salesRepresentativesReports.allRepresentatives')}
              </option>
              {activeRepOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {activeSubTab === 'mine' && (
          <div className="w-64">
            <Select value={selectedManagerId} onChange={(e) => setSelectedManagerId(e.target.value)}>
              <option value="">
                {t(mainSection === 'managers' ? 'managerDashboard.selectManagerPlaceholder' : 'managerDashboard.selectRepPlaceholder')}
              </option>
              {activeRepOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {activeSubTab === 'payouts' && (
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

      {mainSection === 'managers' && activeSubTab === 'list' && (
        <RepresentativesListTab roleNameFilter={branchManagerRoleName} />
      )}
      {mainSection === 'reps' && activeSubTab === 'list' && <RepresentativesListTab roleNameFilter="مندوب" />}
      {activeSubTab === 'reports' && (
        <RepresentativesReportsTab
          representativeId={representativeId}
          year={reportsYear}
          quarter={reportsQuarter}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
        />
      )}
      {activeSubTab === 'mine' && (
        <MyManagerDashboardTab
          controlled={{ selectedRepId: selectedManagerId, year: dashboardYear, quarter: dashboardQuarter, repOptions: activeRepOptions }}
        />
      )}
      {mainSection === 'managers' && activeSubTab === 'payouts' && !payoutsTabRestricted && (
        <CommissionPayoutsTab year={payoutsYear} month={payoutsMonth} />
      )}
    </div>
  );
}
