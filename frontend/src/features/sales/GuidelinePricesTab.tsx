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
import { Tooltip } from '../../components/ui/Tooltip';
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
  /** Set only for a row that already exists as a real sheet — an unset sheetId means this row is
   * brand new and hasn't been saved yet, which is what tells the save handlers below whether to
   * PATCH (update) or POST (create) it, and lets the company cell stay locked/read-only for a row
   * that already has real data (lines, etc.) tied to its supplier. */
  sheetId?: string;
  supplierId: string;
  isAuthorizedAgent: boolean;
  discountPercentage: string;
}

function emptyCompanyRow(): CompanyRowForm {
  return { supplierId: '', isAuthorizedAgent: false, discountPercentage: '' };
}

const iconButtonClass = 'rounded-lg p-2 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/5';

/** Shared dynamic row list for both the "add" and "edit" modals below — a row's company picker is
 * locked to plain text once it already has a real sheetId (see CompanyRowForm's doc comment); a
 * freshly-added row keeps a live SearchableSelect. */
function CompanyRowsEditor({
  rows,
  onChange,
  supplierOptions,
  labels,
}: {
  rows: CompanyRowForm[];
  onChange: (rows: CompanyRowForm[]) => void;
  supplierOptions: { value: string; label: string }[];
  labels: { company: string; discount: string; agent: string; selectCompany: string; addCompany: string; delete: string };
}) {
  function update(i: number, patch: Partial<CompanyRowForm>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="app-table">
          <thead>
            <tr>
              <th>{labels.company}</th>
              <th>{labels.discount}</th>
              <th>{labels.agent}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  {row.sheetId ? (
                    <span>{supplierOptions.find((o) => o.value === row.supplierId)?.label ?? '—'}</span>
                  ) : (
                    <SearchableSelect
                      options={supplierOptions}
                      value={row.supplierId}
                      onChange={(v) => update(i, { supplierId: v })}
                      placeholder={labels.selectCompany}
                    />
                  )}
                </td>
                <td>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={row.discountPercentage}
                    onChange={(e) => update(i, { discountPercentage: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.isAuthorizedAgent}
                    onChange={(e) => update(i, { isAuthorizedAgent: e.target.checked })}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-lg leading-none hover:bg-black/5 dark:hover:bg-white/5"
                    onClick={() => remove(i)}
                    aria-label={labels.delete}
                    title={labels.delete}
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" onClick={() => onChange([...rows, emptyCompanyRow()])}>
        + {labels.addCompany}
      </Button>
    </div>
  );
}

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

  const [editGroupKey, setEditGroupKey] = useState<string | null>(null);
  const [editCompanyRows, setEditCompanyRows] = useState<CompanyRowForm[]>([]);

  const sheetsQuery = useQuery({
    queryKey: ['guideline-price-sheets', companyId],
    queryFn: () => unwrap<GuidelinePriceSheet[]>(apiClient.get('/sales/guideline-prices', { params: { companyId } })),
    enabled: !!companyId,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<SupplierOption[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: (modalOpen || !!editGroupKey) && !!companyId,
  });
  const supplierOptions = (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.companyName }));

  const rowLabels = {
    company: t('guidelinePrices.company'),
    discount: t('guidelinePrices.discountPercentage'),
    agent: t('guidelinePrices.isAuthorizedAgent'),
    selectCompany: t('guidelinePrices.selectCompany') ?? '',
    addCompany: t('guidelinePrices.addCompany'),
    delete: t('common.delete'),
  };

  // One row per month/year, grouping every company's sheet for that month together — the list
  // table's job is now "which companies have a sheet this month", not per-model prices (those
  // differ per company and are managed per-sheet from the detail page, see onRowClick below).
  // Insertion order follows sheetsQuery.data's own year/month DESC ordering from the backend, so
  // groups stay correctly sorted without a separate sort step here.
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

  const editGroup = groupedRows.find((g) => `${g.year}-${g.month}` === editGroupKey) ?? null;

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

  function openEditGroup(group: GroupedSheetsRow) {
    setEditGroupKey(`${group.year}-${group.month}`);
    setEditCompanyRows(
      group.sheets.map((s) => ({
        sheetId: s.id,
        supplierId: s.supplierId,
        isAuthorizedAgent: s.isAuthorizedAgent,
        discountPercentage: String(Number(s.discountPercentage)),
      })),
    );
  }

  // Reconciles the edited row list against the group's real sheets: a row that lost its sheetId's
  // match (removed by the user) gets deleted, an existing row's discount/agent gets patched, and a
  // brand-new row (no sheetId) gets created via the same bulk-create endpoint the "add" modal uses
  // — all in parallel, then one shared invalidate/toast once every request settles.
  const editSaveMutation = useMutation({
    mutationFn: async () => {
      if (!editGroup) return;
      const keptIds = new Set(editCompanyRows.filter((r) => r.sheetId).map((r) => r.sheetId));
      const removed = editGroup.sheets.filter((s) => !keptIds.has(s.id));
      const changed = editCompanyRows.filter((r) => r.sheetId);
      const added = editCompanyRows.filter((r) => !r.sheetId && r.supplierId);

      await Promise.all([
        ...removed.map((s) => apiClient.delete(`/sales/guideline-prices/${s.id}`)),
        ...changed.map((r) =>
          apiClient.patch(`/sales/guideline-prices/${r.sheetId}`, {
            isAuthorizedAgent: r.isAuthorizedAgent,
            discountPercentage: Number(r.discountPercentage) || 0,
          }),
        ),
        ...(added.length
          ? [
              apiClient.post('/sales/guideline-prices', {
                month: editGroup.month,
                year: editGroup.year,
                companies: added.map((r) => ({
                  supplierId: r.supplierId,
                  isAuthorizedAgent: r.isAuthorizedAgent,
                  discountPercentage: Number(r.discountPercentage) || 0,
                })),
              }),
            ]
          : []),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-price-sheets'] });
      setEditGroupKey(null);
      toast.success(t('guidelinePrices.updated'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (group: GroupedSheetsRow) =>
      Promise.all(group.sheets.map((s) => apiClient.delete(`/sales/guideline-prices/${s.id}`))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-price-sheets'] });
      toast.success(t('guidelinePrices.deleted'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDeleteGroup(e: MouseEvent, group: GroupedSheetsRow) {
    e.stopPropagation();
    const ok = await confirm({
      message: t('common.confirmDelete', { name: `${monthNameOnly(group.month, i18n.language)} ${group.year}` }),
    });
    if (ok) deleteGroupMutation.mutate(group);
  }

  const columns: Column<GroupedSheetsRow>[] = [
    { header: t('guidelinePrices.month'), accessor: (r) => `${monthNameOnly(r.month, i18n.language)} ${r.year}` },
    {
      header: t('guidelinePrices.companies'),
      accessor: (r) => (
        <span className="inline-flex flex-wrap items-center justify-center gap-x-1">
          {r.sheets.map((s, i) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-[var(--text-muted)]">-</span>}
              <Tooltip
                content={
                  <div className="flex flex-col gap-0.5">
                    <div>
                      {t('guidelinePrices.discountPercentage')}: {formatAmount(s.discountPercentage)}%
                    </div>
                    <div>
                      {t(s.isAuthorizedAgent ? 'guidelinePrices.isAuthorizedAgent' : 'guidelinePrices.notAuthorizedAgent')}
                    </div>
                  </div>
                }
              >
                <span className="text-blue-600 dark:text-blue-400">{s.supplier?.companyName ?? '—'}</span>
              </Tooltip>
            </span>
          ))}
        </span>
      ),
    },
    ...(canEdit || canDelete
      ? [
          {
            header: t('common.actions'),
            isActions: true,
            accessor: (r: GroupedSheetsRow) => (
              <div className="flex flex-wrap justify-center gap-1">
                {canEdit && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditGroup(r);
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
                    onClick={(e) => handleDeleteGroup(e, r)}
                    disabled={deleteGroupMutation.isPending}
                  >
                    🗑️
                  </button>
                )}
              </div>
            ),
            align: 'center' as const,
          },
        ]
      : []),
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

          <CompanyRowsEditor rows={companyRows} onChange={setCompanyRows} supplierOptions={supplierOptions} labels={rowLabels} />

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
        open={!!editGroup}
        onClose={() => setEditGroupKey(null)}
        title={editGroup ? `${monthNameOnly(editGroup.month, i18n.language)} ${editGroup.year}` : ''}
        widthClass="max-w-4xl"
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            editSaveMutation.mutate();
          }}
        >
          <CompanyRowsEditor
            rows={editCompanyRows}
            onChange={setEditCompanyRows}
            supplierOptions={supplierOptions}
            labels={rowLabels}
          />
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button type="button" variant="secondary" onClick={() => setEditGroupKey(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={editSaveMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
