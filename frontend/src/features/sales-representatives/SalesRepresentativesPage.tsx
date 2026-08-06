import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/ui/PageHeader';
import { useActiveCompany } from '../../lib/use-active-company';
import { RepresentativesListTab } from './RepresentativesListTab';
import { RepresentativesReportsTab } from './RepresentativesReportsTab';

type Tab = 'list' | 'reports';

export function SalesRepresentativesPage() {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const [tab, setTab] = useState<Tab>('list');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'list', label: t(isPrintingPress ? 'salesRepresentativesReports.listTabPress' : 'salesRepresentativesReports.listTab') },
    { key: 'reports', label: t(isPrintingPress ? 'salesRepresentativesReports.reportsTabPress' : 'salesRepresentativesReports.reportsTab') },
  ];

  return (
    <div>
      <PageHeader title={t(isPrintingPress ? 'nav.salesRepresentativesPress' : 'nav.salesRepresentatives')} />

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

      {tab === 'list' && <RepresentativesListTab />}
      {tab === 'reports' && <RepresentativesReportsTab />}
    </div>
  );
}
