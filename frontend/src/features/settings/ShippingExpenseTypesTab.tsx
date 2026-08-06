import { MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';

const ENDPOINT = '/imports/shipping-expense-types';

interface ShippingExpenseType {
  id: string;
  nameEn: string;
}

export function ShippingExpenseTypesTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState('');

  const listQuery = useQuery({
    queryKey: [ENDPOINT],
    queryFn: () => unwrap<ShippingExpenseType[]>(apiClient.get(ENDPOINT)),
  });

  function openCreate() {
    setEditingId(null);
    setNameEn('');
    setModalOpen(true);
  }

  function openEdit(row: ShippingExpenseType) {
    setEditingId(row.id);
    setNameEn(row.nameEn);
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId
        ? apiClient.patch(`${ENDPOINT}/${editingId}`, { nameEn })
        : apiClient.post(ENDPOINT, { nameEn }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ENDPOINT] });
      setModalOpen(false);
      setEditingId(null);
      setNameEn('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`${ENDPOINT}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ENDPOINT] }),
  });

  async function handleDelete(e: MouseEvent, row: ShippingExpenseType) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.nameEn }) });
    if (ok) deleteMutation.mutate(row.id);
  }

  const rows = listQuery.data ?? [];

  const columns: Column<ShippingExpenseType>[] = [
    { header: t('common.sequence'), accessor: (r) => rows.findIndex((x) => x.id === r.id) + 1, width: '4rem' },
    { header: t('imports.shippingExpenseTypeName'), accessor: (r) => r.nameEn },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(r);
            }}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteMutation.isPending}
            onClick={(e) => handleDelete(e, r)}
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
        <Button onClick={openCreate}>+ {t('common.add')}</Button>
      </div>

      <DataTable columns={columns} data={rows} keyField={(r) => r.id} isLoading={listQuery.isLoading} searchable={false} />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? t('common.edit') : t('common.add')}
      >
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <FormField label={t('imports.shippingExpenseTypeName')}>
            <Input required value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </FormField>
          <div className="mt-2 flex justify-end gap-2">
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
