import { MouseEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
  GuidelinePriceLineEditor,
  GuidelinePriceLineForm,
  emptyGuidelinePriceLine,
  guidelineLinesToPayload,
} from './GuidelinePriceLineEditor';

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<GuidelinePriceLineForm[]>([emptyGuidelinePriceLine()]);

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

  // Dynamic columns: the union of every product ever priced across all sheets, in first-seen
  // order — the table's whole point is one column per AC model with each month as a row.
  const productColumns = useMemo(() => {
    const seen = new Map<string, string>();
    for (const sheet of sheetsQuery.data ?? []) {
      for (const line of sheet.lines) {
        if (!seen.has(line.productId)) {
          seen.set(
            line.productId,
            line.product?.sku ? `${line.product.sku} — ${line.product.nameEn}` : line.product?.nameEn ?? '—',
          );
        }
      }
    }
    return Array.from(seen.entries());
  }, [sheetsQuery.data]);

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

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/sales/guideline-prices/${editingId}`, { lines: guidelineLinesToPayload(editLines) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-price-sheets'] });
      setEditingId(null);
      toast.success(t('guidelinePrices.updated'));
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

  function openEdit(sheet: GuidelinePriceSheet) {
    setEditingId(sheet.id);
    setEditLines(
      sheet.lines.length
        ? // Number(...) before String(...) — price is typed `number` but Postgres numeric columns
          // come back as fixed-decimal strings (e.g. "3000.0000"); without this the raw DB string
          // lands straight in this editable field.
          sheet.lines.map((l) => ({ productId: l.productId, price: String(Number(l.price)) }))
        : [emptyGuidelinePriceLine()],
    );
  }

  async function handleDelete(e: MouseEvent, sheet: GuidelinePriceSheet) {
    e.stopPropagation();
    const ok = await confirm({
      message: t('common.confirmDelete', { name: `${monthNameOnly(sheet.month, i18n.language)} ${sheet.year}` }),
    });
    if (ok) deleteMutation.mutate(sheet.id);
  }

  function updateCompanyRow(index: number, patch: Partial<CompanyRowForm>) {
    setCompanyRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function removeCompanyRow(index: number) {
    setCompanyRows((rows) => rows.filter((_, i) => i !== index));
  }

  const columns: Column<GuidelinePriceSheet>[] = [
    { header: t('guidelinePrices.month'), accessor: (r) => `${monthNameOnly(r.month, i18n.language)} ${r.year}` },
    { header: t('guidelinePrices.company'), accessor: (r) => r.supplier?.companyName ?? '—' },
    ...productColumns.map(([productId, label]) => ({
      header: label,
      accessor: (r: GuidelinePriceSheet) => {
        const line = r.lines.find((l) => l.productId === productId);
        return line ? formatAmount(line.price) : '—';
      },
      align: 'right' as const,
    })),
    ...(canEdit || canDelete
      ? [
          {
            header: t('common.actions'),
            isActions: true,
            accessor: (r: GuidelinePriceSheet) => (
              <div className="flex flex-wrap justify-center gap-1">
                {canEdit && (
                  <button
                    type="button"
                    className={iconButtonClass}
                    title={t('common.edit')}
                    aria-label={t('common.edit')}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(r);
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
                    onClick={(e) => handleDelete(e, r)}
                    disabled={deleteMutation.isPending}
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
        data={sheetsQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={sheetsQuery.isLoading}
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

      <Modal open={!!editingId} onClose={() => setEditingId(null)} title={t('common.edit')} widthClass="max-w-4xl">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
        >
          <GuidelinePriceLineEditor lines={editLines} onChange={setEditLines} />
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
