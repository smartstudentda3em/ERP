import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useToast } from '../../components/ui/Toast';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface Partner {
  id: string;
  name: string;
  sharePercentage: number;
  isActive: boolean;
}

const emptyForm = { name: '', sharePercentage: '' };

export function PartnersTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const partnersQuery = useQuery({
    queryKey: ['partners'],
    queryFn: () => unwrap<Partner[]>(apiClient.get('/settings/partners')),
  });

  const partners = partnersQuery.data ?? [];
  const currentTotal = useMemo(
    () => partners.filter((p) => p.id !== editingId).reduce((sum, p) => sum + Number(p.sharePercentage ?? 0), 0),
    [partners, editingId],
  );
  // The capital-injection split (Partners > Contributions) only ever uses active partners, and
  // requires their shares to total exactly 100% — this is what that check actually looks at.
  const activeTotal = useMemo(
    () => partners.filter((p) => p.isActive).reduce((sum, p) => sum + Number(p.sharePercentage ?? 0), 0),
    [partners],
  );
  const isComplete = Math.abs(activeTotal - 100) < 0.01;
  const projectedTotal = currentTotal + Number(form.sharePercentage || 0);
  const willExceed = projectedTotal > 100;

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(row: Partner) {
    setEditingId(row.id);
    setForm({ name: row.name, sharePercentage: String(row.sharePercentage ?? '') });
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name, sharePercentage: Number(form.sharePercentage) };
      if (editingId) return apiClient.patch(`/settings/partners/${editingId}`, payload);
      return apiClient.post('/settings/partners', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partners'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? String(err?.message ?? err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/settings/partners/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partners'] }),
  });

  const columns: Column<Partner>[] = [
    { header: t('fields.partnerName'), accessor: (r) => r.name },
    { header: t('fields.sharePercentage'), accessor: (r) => `${formatAmount(r.sharePercentage)}%`, align: 'right' },
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
              const ok = await confirm({ message: t('common.confirmDelete', { name: r.name }) });
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
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-[var(--text-muted)]">
          {t('partners.totalShare')}: <span className="font-medium text-[var(--text)]">{formatAmount(currentTotal)}%</span>
          {' — '}
          <span className={isComplete ? 'text-green-600' : 'text-amber-600'}>
            {isComplete ? t('partners.sharesComplete') : t('partners.sharesIncomplete', { remaining: formatAmount(100 - activeTotal) })}
          </span>
        </div>
        <Button onClick={openCreate}>+ {t('partners.addNew')}</Button>
      </div>

      <DataTable columns={columns} data={partners} keyField={(r) => r.id} isLoading={partnersQuery.isLoading} />

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        title={editingId ? t('common.edit') : t('partners.addNew')}
      >
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('fields.partnerName')}>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('fields.sharePercentage')}>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={form.sharePercentage}
                onChange={(e) => setForm({ ...form, sharePercentage: e.target.value })}
              />
            </FormField>
          </div>
          {form.sharePercentage !== '' && (
            <div className={`col-span-2 text-xs ${willExceed ? 'text-red-600' : 'text-[var(--text-muted)]'}`}>
              {willExceed
                ? t('partners.exceedsWarning', { total: formatAmount(projectedTotal) })
                : `${t('partners.totalShare')}: ${formatAmount(projectedTotal)}%`}
            </div>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setModalOpen(false);
                setEditingId(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || willExceed}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
