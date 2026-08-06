import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface NumberingSeries {
  id: string;
  documentType: string;
  prefix: string;
  startNumber: number;
  nextNumber: number;
  padLength: number;
  resetPeriod: 'NEVER' | 'MONTHLY' | 'YEARLY';
}

/** Every document/entity type in the system that can carry an auto-numbered code, grouped the same way the sidebar/menus are. */
const DOCUMENT_TYPE_GROUPS: { groupKey: string; options: string[] }[] = [
  { groupKey: 'warehouses', options: ['PURCHASE_RECEIPT', 'STOCK_ADJUSTMENT', 'STOCK_TRANSFER'] },
  { groupKey: 'products', options: ['PRODUCT'] },
  { groupKey: 'parties', options: ['CUSTOMER', 'SUPPLIER'] },
  { groupKey: 'salesReps', options: ['SALES_REPRESENTATIVE'] },
  { groupKey: 'sales', options: ['QUOTATION', 'SALES_ORDER', 'SALES_INVOICE', 'SALES_PAYMENT'] },
  { groupKey: 'treasury', options: ['CASH_MOVEMENT'] },
];

const emptyForm = {
  documentType: '',
  prefix: '',
  startNumber: '1',
  padLength: '5',
  resetPeriod: 'NEVER' as NumberingSeries['resetPeriod'],
};

export function NumberingSeriesTab({ companyId }: { companyId?: string | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingNextNumber, setEditingNextNumber] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const seriesQuery = useQuery({
    queryKey: ['numbering-series'],
    queryFn: () => unwrap<NumberingSeries[]>(apiClient.get('/settings/numbering-series')),
  });

  function openCreate() {
    setEditingId(null);
    setEditingNextNumber(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(row: NumberingSeries) {
    setEditingId(row.id);
    setEditingNextNumber(row.nextNumber);
    setForm({
      documentType: row.documentType,
      prefix: row.prefix ?? '',
      startNumber: String(row.startNumber ?? 1),
      padLength: String(row.padLength ?? 5),
      resetPeriod: row.resetPeriod ?? 'NEVER',
    });
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        documentType: form.documentType,
        prefix: form.prefix,
        startNumber: Number(form.startNumber),
        padLength: Number(form.padLength),
        resetPeriod: form.resetPeriod,
        companyId,
      };
      if (editingId) return apiClient.patch(`/settings/numbering-series/${editingId}`, payload);
      return apiClient.post('/settings/numbering-series', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numbering-series'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/settings/numbering-series/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['numbering-series'] }),
  });

  function documentTypeLabel(type: string): string {
    return t(`numberingSeries.documentTypes.${type}`, type);
  }

  const columns: Column<NumberingSeries>[] = [
    { header: t('fields.documentType'), accessor: (r) => documentTypeLabel(r.documentType) },
    { header: t('fields.prefix'), accessor: (r) => r.prefix || '—' },
    { header: t('fields.startNumber'), accessor: (r) => r.startNumber, align: 'right' },
    { header: t('fields.nextNumber'), accessor: (r) => r.nextNumber, align: 'right' },
    { header: t('fields.padLength'), accessor: (r) => r.padLength, align: 'right' },
    {
      header: t('fields.resetPeriod'),
      accessor: (r) => t(`numberingSeries.resetPeriod.${r.resetPeriod}`),
    },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(r)}>
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              const ok = await confirm({ message: t('common.confirmDelete', { name: documentTypeLabel(r.documentType) }) });
              if (ok) deleteMutation.mutate(r.id);
            }}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button onClick={openCreate}>+ {t('numberingSeries.addNew')}</Button>
      </div>

      <DataTable columns={columns} data={seriesQuery.data ?? []} keyField={(r) => r.id} isLoading={seriesQuery.isLoading} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('common.edit') : t('numberingSeries.addNew')}
      >
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('fields.documentType')}>
              <Select
                required
                disabled={!!editingId}
                value={form.documentType}
                onChange={(e) => setForm({ ...form, documentType: e.target.value })}
              >
                <option value="">—</option>
                {DOCUMENT_TYPE_GROUPS.map((group) => (
                  <optgroup key={group.groupKey} label={t(`numberingSeries.documentTypeGroups.${group.groupKey}`)}>
                    {group.options.map((type) => (
                      <option key={type} value={type}>
                        {documentTypeLabel(type)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label={t('fields.prefix')}>
            <Input
              placeholder="INV-"
              value={form.prefix}
              onChange={(e) => setForm({ ...form, prefix: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.startNumber')}>
            <Input
              type="number"
              min="1"
              required
              value={form.startNumber}
              onChange={(e) => setForm({ ...form, startNumber: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.padLength')}>
            <Input
              type="number"
              min="1"
              max="10"
              required
              value={form.padLength}
              onChange={(e) => setForm({ ...form, padLength: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.resetPeriod')}>
            <Select
              value={form.resetPeriod}
              onChange={(e) => setForm({ ...form, resetPeriod: e.target.value as NumberingSeries['resetPeriod'] })}
            >
              <option value="NEVER">{t('numberingSeries.resetPeriod.NEVER')}</option>
              <option value="MONTHLY">{t('numberingSeries.resetPeriod.MONTHLY')}</option>
              <option value="YEARLY">{t('numberingSeries.resetPeriod.YEARLY')}</option>
            </Select>
          </FormField>
          {editingId && editingNextNumber !== null && (
            <div className="col-span-2 text-xs text-[var(--text-muted)]">
              {t('fields.nextNumber')}: <span className="font-medium text-[var(--text)]">{editingNextNumber}</span>
              {' — '}
              {t('numberingSeries.nextNumberHint')}
            </div>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
