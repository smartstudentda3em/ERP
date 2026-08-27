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
import { TotalCommissionsTab } from './TotalCommissionsTab';

type MainSection = 'managers' | 'reps' | 'totalCommissions';
type ManagerSubTab = 'list' | 'reports' | 'mine' | 'payouts';
type RepSubTab = 'list' | 'reports' | 'mine';

interface SalesRepresentative {
  id: string;
  name: string;
}

export function SalesRepresentativesPage() {
  const { t, i18n } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  // "مدير فرع" is a single shared, company-unrestricted role (see BRANCH_MANAGER_ROLE_NAME in
  // backend/src/modules/users/users.service.ts) — the same name filters correctly for every company.
  const branchManagerRoleName = 'مدير فرع';
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

  // "إجمالي العمولات" filter — its own month/year state (not shared with "صرف الأرباح" above),
  // since this tab is system-wide (every company) while "صرف الأرباح" only ever renders for the
  // Printing Press — keeping them separate avoids one tab's filter silently driving the other's.
  const [totalCommissionsYear, setTotalCommissionsYear] = useState(now.getFullYear());
  const [totalCommissionsMonth, setTotalCommissionsMonth] = useState(now.getMonth() + 1);

  // مدراء الأفرع and المناديب are a different specialty each, with their own permissions/commission
  // model (see today's AC fixed-commission work) — a رep picked while viewing one section must
  // never keep driving "تقارير"/"لوحة" once the user switches to the other, or that section would
  // silently keep showing the previous section's person's data (their id just doesn't happen to
  // match any option in the new list, but the dashboard/report query itself doesn't care and fetches
  // it anyway). Resetting on every section switch is what actually enforces the separation.
  function switchMainSection(section: MainSection): void {
    setMainSection(section);
    setSelectedManagerId('');
    setRepresentativeId('');
  }

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

  const activeSubTab = mainSection === 'managers' ? managerSubTab : mainSection === 'reps' ? repSubTab : undefined;

  return (
    <div>
      <PageHeader title={t('nav.salesRepresentatives')} />

      {/* Level 1: مدراء الأفرع / المناديب */}
      <div className="mb-4 flex gap-2 border-b border-[var(--border)] text-base font-semibold">
        <button
          className={`-mb-px border-b-2 px-4 py-2 ${
            mainSection === 'managers' ? 'border-primary-600 text-primary-600' : 'border-transparent text-[var(--text-muted)]'
          }`}
          onClick={() => switchMainSection('managers')}
        >
          {t('salesRepresentativesReports.listTabPress')}
        </button>
        <button
          className={`-mb-px border-b-2 px-4 py-2 ${
            mainSection === 'reps' ? 'border-primary-600 text-primary-600' : 'border-transparent text-[var(--text-muted)]'
          }`}
          onClick={() => switchMainSection('reps')}
        >
          {t('salesRepresentativesReports.repsTab')}
        </button>
        <button
          className={`-mb-px border-b-2 px-4 py-2 ${
            mainSection === 'totalCommissions' ? 'border-primary-600 text-primary-600' : 'border-transparent text-[var(--text-muted)]'
          }`}
          onClick={() => switchMainSection('totalCommissions')}
        >
          {t('salesRepresentativesReports.totalCommissionsTab')}
        </button>
      </div>

      {/* Level 2: the sub-tabs belonging only to the currently selected section above — "إجمالي
          العمولات" has no sub-tabs of its own, just a month/year filter, rendered separately below. */}
      {mainSection !== 'totalCommissions' && (
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
      )}

      {mainSection === 'totalCommissions' && (
        <div className="mb-4 flex items-center gap-2">
          <div className="w-24">
            <Select value={totalCommissionsYear} onChange={(e) => setTotalCommissionsYear(Number(e.target.value))}>
              {dashboardYearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-40">
            <Select value={totalCommissionsMonth} onChange={(e) => setTotalCommissionsMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthNameOnly(m, i18n.language)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

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
          isManagerSection={mainSection === 'managers'}
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
      {mainSection === 'totalCommissions' && (
        <TotalCommissionsTab year={totalCommissionsYear} month={totalCommissionsMonth} />
      )}
    </div>
  );
}
