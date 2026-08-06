import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { SimpleMasterList } from './SimpleMasterList';
import { CategoriesTab } from './CategoriesTab';
import { NumberingSeriesTab } from './NumberingSeriesTab';
import { PartnersTab } from './PartnersTab';
import { ShippingExpenseTypesTab } from './ShippingExpenseTypesTab';
import { FactoryResetTab } from './FactoryResetTab';

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

type Tab =
  | 'companies'
  | 'branches'
  | 'warehouses'
  | 'currencies'
  | 'taxes'
  | 'categories'
  | 'expense-categories'
  | 'shipping-expense-types'
  | 'numbering-series'
  | 'partners'
  | 'factory-reset';

export function SettingsPage() {
  const { t } = useTranslation();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const hasFactoryResetPermission = useAuthStore((s) => s.hasPermission('system.delete'));
  // isSystemRole reflects the real Administrator/Super-Admin role (Role.isSystemRole), set on the
  // JWT/login response at auth time — checked here in addition to the specific permission so this
  // tab can never appear just because *some* role was later granted 'system.delete'. This is a UI
  // nicety only; the backend independently re-verifies the caller's actual role before acting,
  // since anything checked purely in the browser is trivially bypassed via devtools.
  const isSuperAdmin = useAuthStore((s) => s.user?.isSystemRole ?? false);
  const canFactoryReset = hasFactoryResetPermission && isSuperAdmin;
  const canViewPartners = useAuthStore((s) => s.hasPermission('settings.partner.view'));
  const { isPrintingPress } = useActiveCompany();
  const [tab, setTab] = useState<Tab>('companies');

  // Printing Press only: lets each warehouse be permanently linked to its owning branch (see
  // part 2 of the stock-audit branch-mapping request) — other companies keep the plain
  // name-only warehouse form, unchanged.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && tab === 'warehouses',
  });
  const branchOptions = (branchesQuery.data ?? []).map((b) => ({ value: b.id, label: b.nameAr || b.nameEn }));
  const branchNameById = (id: string | null | undefined) =>
    (branchesQuery.data ?? []).find((b) => b.id === id)?.nameAr ||
    (branchesQuery.data ?? []).find((b) => b.id === id)?.nameEn ||
    '—';

  const tabs: { key: Tab; label: string }[] = [
    { key: 'companies', label: t('settingsTabs.companies') },
    { key: 'branches', label: t('settingsTabs.branches') },
    { key: 'warehouses', label: t('settingsTabs.warehouses') },
    { key: 'currencies', label: t('settingsTabs.currencies') },
    { key: 'taxes', label: t('settingsTabs.taxes') },
    { key: 'categories', label: t('settingsTabs.categories') },
    { key: 'expense-categories', label: t('settingsTabs.expenseCategories') },
    ...(!isPrintingPress ? [{ key: 'shipping-expense-types' as Tab, label: t('settingsTabs.shippingExpenseTypes') }] : []),
    { key: 'numbering-series', label: t('settingsTabs.numberingSeries') },
    ...(canViewPartners ? [{ key: 'partners' as Tab, label: t('settingsTabs.partners') }] : []),
    ...(canFactoryReset ? [{ key: 'factory-reset' as Tab, label: t('settingsTabs.factoryReset') }] : []),
  ];

  return (
    <div>
      <PageHeader title={t('nav.settings')} />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
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

      {tab === 'companies' && (
        <SimpleMasterList
          endpoint="/settings/companies"
          fields={[
            { name: 'nameAr', label: t('fields.nameAr'), required: true },
            { name: 'logoUrl', label: t('fields.logoUrl') },
          ]}
          columns={[
            { header: t('common.code'), accessor: (r) => r.code },
            { header: t('common.name'), accessor: (r) => r.nameAr || r.nameEn },
            { header: t('fields.phone'), accessor: (r) => r.phone ?? '—' },
          ]}
        />
      )}

      {tab === 'branches' && (
        <SimpleMasterList
          endpoint="/settings/branches"
          extraPayload={{ companyId }}
          fields={[{ name: 'nameEn', label: t('common.name'), required: true }]}
          columns={[{ header: t('common.name'), accessor: (r) => r.nameEn }]}
        />
      )}

      {tab === 'warehouses' && (
        <SimpleMasterList
          endpoint="/settings/warehouses"
          extraPayload={{ companyId }}
          fields={[
            { name: 'nameEn', label: t('common.name'), required: true },
            ...(isPrintingPress
              ? [
                  {
                    name: 'branchId',
                    label: t('fields.branch'),
                    type: 'select',
                    required: true,
                    placeholder: t('actions.selectBranch'),
                    options: branchOptions,
                  },
                ]
              : []),
          ]}
          columns={[
            { header: t('common.name'), accessor: (r) => r.nameEn },
            ...(isPrintingPress
              ? [{ header: t('fields.branch'), accessor: (r: any) => branchNameById(r.branchId) }]
              : []),
          ]}
        />
      )}

      {tab === 'currencies' && (
        <SimpleMasterList
          endpoint="/settings/currencies"
          fields={[
            { name: 'nameEn', label: t('common.name'), required: true },
            { name: 'symbol', label: t('fields.symbol') },
          ]}
          columns={[
            { header: t('common.name'), accessor: (r) => r.nameEn },
            { header: t('fields.symbol'), accessor: (r) => r.symbol ?? '—' },
          ]}
        />
      )}

      {tab === 'taxes' && (
        <SimpleMasterList
          endpoint="/settings/taxes"
          fields={[
            { name: 'nameEn', label: t('common.name'), required: true },
            { name: 'rate', label: t('fields.rate'), type: 'number', required: true },
          ]}
          columns={[
            { header: t('common.name'), accessor: (r) => r.nameEn },
            { header: t('fields.rate'), accessor: (r) => r.rate, align: 'right' },
          ]}
        />
      )}

      {tab === 'categories' && <CategoriesTab />}

      {tab === 'expense-categories' && (
        <SimpleMasterList
          endpoint="/settings/expense-categories"
          fields={[
            { name: 'nameEn', label: t('common.name'), required: true },
            { name: 'isActive', label: t('common.active'), type: 'checkbox' },
          ]}
          columns={[
            { header: t('common.name'), accessor: (r) => r.nameEn },
            { header: t('common.active'), accessor: (r) => (r.isActive ? t('common.yes') : t('common.no')) },
          ]}
        />
      )}

      {tab === 'shipping-expense-types' && !isPrintingPress && <ShippingExpenseTypesTab />}

      {tab === 'numbering-series' && <NumberingSeriesTab companyId={companyId} />}

      {tab === 'partners' && canViewPartners && <PartnersTab />}

      {tab === 'factory-reset' && canFactoryReset && <FactoryResetTab />}
    </div>
  );
}
