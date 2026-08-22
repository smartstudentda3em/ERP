import { MouseEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { useAuthStore } from '../../store/auth-store';
import { formatAmount } from '../../lib/number-format';
import { monthNameOnly } from '../../lib/date-utils';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';

interface GuidelinePriceLine {
  id: string;
  productId: string;
  price: number;
  product: { nameEn: string; sku?: string | null };
}

interface GuidelinePriceSheet {
  id: string;
  month: number;
  year: number;
  supplierId: string;
  isAuthorizedAgent: boolean;
  discountPercentage: number;
  supplier: { companyName: string };
  lines: GuidelinePriceLine[];
}

interface GroupedSheetsRow {
  month: number;
  year: number;
  sheets: GuidelinePriceSheet[];
}

interface SupplierOption {
  id: string;
  companyName: string;
}

interface CompanyRowForm {
  supplierId: string;
  isAuthorizedAgent: boolean;
  discountPercentage: string;
}

function emptyCompanyRow(): CompanyRowForm {
  return { supplierId: '', isAuthorizedAgent: false, discountPercentage: '' };
}

const iconButtonClass = 'rounded-lg p-2 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/5';

export function GuidelinePricesTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission('sales.guidelinePrice.create');
  const canEdit = hasPermission('sales.guidelinePrice.edit');
  const canDelete = hasPermission('sales.guidelinePrice.delete');

  const now = new Date();
  const [modalOpen, setModalOpen] = useState(false);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [companyRows, setCompanyRows] = useState<CompanyRowForm[]>([emptyCompanyRow()]);
  const [manageGroupKey, setManageGroupKey] = useState<string | null>(null);

  const sheetsQuery = useQuery({
    queryKey: ['guideline-price-sheets', companyId],
    queryFn: () => unwrap<GuidelinePriceSheet[]>(apiClient.get('/sales/guideline-prices', { params: { companyId } })),
    enabled: !!companyId,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<SupplierOption[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: modalOpen && !!companyId,
  });
  const supplierOptions = (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.companyName }));

  // One row per month/year, grouping every company's sheet for that month together — the list
  // table's job is now "which companies have a sheet this month", not per-model prices (those
  // differ per company and are managed per-sheet from the company popover below). Insertion order
  // follows sheetsQuery.data's own year/month DESC ordering from the backend, so groups stay
  // correctly sorted without a separate sort step here.
  const groupedRows = useMemo(() => {
    const groups = new Map<string, GroupedSheetsRow>();
    for (const sheet of sheetsQuery.data ?? []) {
      const key = `${sheet.year}-${sheet.month}`;
      const group = groups.get(key);
      if (group) group.sheets.push(sheet);
      else groups.set(key, { month: sheet.month, year: sheet.year, sheets: [sheet] });
    }
    return Array.from(groups.values());
  }, [sheetsQuery.data]);

  const manageGroup = groupedRows.find((g) => `${g.year}-${g.month}` === manageGroupKey) ?? null;

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/sales/guideline-prices', {
        month,
        year,
        companies: companyRows
          .filter((r) => r.supplierId)
          .map((r) => ({
            supplierId: r.supplierId,
            isAuthorizedAgent: r.isAuthorizedAgent,
            discountPercentage: Number(r.discountPercentage) || 0,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-price-sheets'] });
      setModalOpen(false);
      setCompanyRows([emptyCompanyRow()]);
      toast.success(t('guidelinePrices.created'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sales/guideline-prices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-price-sheets'] });
      toast.success(t('guidelinePrices.deleted'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDelete(e: MouseEvent, sheet: GuidelinePriceSheet) {
    e.stopPropagation();
    const ok = await confirm({
      message: t('common.confirmDelete', {
        name: `${sheet.supplier?.companyName ?? ''} — ${monthNameOnly(sheet.month, i18n.language)} ${sheet.year}`,
      }),
    });
    if (ok) deleteMutation.mutate(sheet.id);
  }

  function updateCompanyRow(index: number, patch: Partial<CompanyRowForm>) {
    setCompanyRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeCompanyRow(index: number) {
    setCompanyRows((rows) => rows.filter((_, i) => i !== index));
  }

  const columns: Column<GroupedSheetsRow>[] = [
    { header: t('guidelinePrices.month'), accessor: (r) => `${monthNameOnly(r.month, i18n.language)} ${r.year}` },
    {
      header: t('guidelinePrices.company'),
      accessor: (r) => {
        const visible = r.sheets.slice(0, 2);
        const overflow = r.sheets.length - visible.length;
        return (
          <button
            type="button"
            className="inline-flex flex-wrap items-center justify-center gap-1.5 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setManageGroupKey(`${r.year}-${r.month}`);
            }}
          >
            <span>{visible.map((s) => s.supplier?.companyName ?? '—').join(' - ')}</span>
            {overflow > 0 && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {t('guidelinePrices.moreCompanies', { count: overflow })}
              </span>
            )}
          </button>
        );
      },
    },
  ];

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div>
      {canCreate && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => setModalOpen(true)}>+ {t('guidelinePrices.add')}</Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={groupedRows}
        keyField={(r) => `${r.year}-${r.month}`}
        isLoading={sheetsQuery.isLoading}
        onRowClick={(r) => navigate(`/suppliers/guideline-prices/${r.year}/${r.month}`)}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('guidelinePrices.add')} widthClass="max-w-4xl">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label={t('guidelinePrices.monthLabel')}>
              <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {monthOptions.map((m) => (
                  <option key={m} value={m}>
                    {monthNameOnly(m, i18n.language)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label={t('common.year')}>
              <Input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())}
              />
            </FormField>
          </div>

          <div className="flex flex-col gap-2">
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>{t('guidelinePrices.company')}</th>
                    <th>{t('guidelinePrices.discountPercentage')}</th>
                    <th>{t('guidelinePrices.isAuthorizedAgent')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {companyRows.map((row, i) => (
                    <tr key={i}>
                      <td>
                        <SearchableSelect
                          options={supplierOptions}
                          value={row.supplierId}
                          onChange={(v) => updateCompanyRow(i, { supplierId: v })}
                          placeholder={t('guidelinePrices.selectCompany') ?? ''}
                        />
                      </td>
                      <td>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          required
                          value={row.discountPercentage}
                          onChange={(e) => updateCompanyRow(i, { discountPercentage: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.isAuthorizedAgent}
                          onChange={(e) => updateCompanyRow(i, { isAuthorizedAgent: e.target.checked })}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/5"
                          onClick={() => removeCompanyRow(i)}
                          aria-label={t('common.delete')}
                          title={t('common.delete')}
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="secondary" onClick={() => setCompanyRows([...companyRows, emptyCompanyRow()])}>
              + {t('guidelinePrices.addCompany')}
            </Button>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!manageGroup}
        onClose={() => setManageGroupKey(null)}
        title={manageGroup ? `${monthNameOnly(manageGroup.month, i18n.language)} ${manageGroup.year}` : ''}
        widthClass="max-w-2xl"
      >
        <div className="flex flex-col gap-2">
          {(manageGroup?.sheets ?? []).map((sheet) => (
            <div
              key={sheet.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
            >
              <div>
                <div className="font-medium">{sheet.supplier?.companyName ?? '—'}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                  <span>
                    {t('guidelinePrices.discountPercentage')}: {formatAmount(sheet.discountPercentage)}%
                  </span>
                  {sheet.isAuthorizedAgent && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">
                      {t('guidelinePrices.isAuthorizedAgent')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1">
                {canEdit && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                    onClick={() => {
                      setManageGroupKey(null);
                      navigate(`/suppliers/guideline-prices/${sheet.year}/${sheet.month}?supplierId=${sheet.supplierId}`);
                    }}
                  >
                    ✏️
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    onClick={(e) => handleDelete(e, sheet)}
                    disabled={deleteMutation.isPending}
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
