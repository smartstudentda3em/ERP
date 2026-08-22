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
  lines: GuidelinePriceLine[];
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
  const [lines, setLines] = useState<GuidelinePriceLineForm[]>([emptyGuidelinePriceLine()]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLines, setEditLines] = useState<GuidelinePriceLineForm[]>([emptyGuidelinePriceLine()]);

  const sheetsQuery = useQuery({
    queryKey: ['guideline-price-sheets', companyId],
    queryFn: () => unwrap<GuidelinePriceSheet[]>(apiClient.get('/sales/guideline-prices', { params: { companyId } })),
    enabled: !!companyId,
  });

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
      apiClient.post('/sales/guideline-prices', { month, year, lines: guidelineLinesToPayload(lines) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guideline-price-sheets'] });
      setModalOpen(false);
      setLines([emptyGuidelinePriceLine()]);
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

  const columns: Column<GuidelinePriceSheet>[] = [
    { header: t('guidelinePrices.month'), accessor: (r) => `${monthNameOnly(r.month, i18n.language)} ${r.year}` },
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

          <GuidelinePriceLineEditor lines={lines} onChange={setLines} />

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
