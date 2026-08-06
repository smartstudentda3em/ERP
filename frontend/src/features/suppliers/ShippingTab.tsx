import { MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface Shipment {
  id: string;
  shipmentName: string;
  shipmentDate: string | null;
  shippingCompanyName: string;
  totalCost: number;
}

const emptyForm = {
  shipmentName: '',
  shipmentDate: '',
  shippingCompanyName: '',
};

function money(n: number): string {
  return formatAmount(n);
}

export function ShippingTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const shipmentsQuery = useQuery({
    queryKey: ['shipments', companyId],
    queryFn: () => unwrap<Shipment[]>(apiClient.get('/imports/shipments', { params: { companyId } })),
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        companyId,
        shipmentName: form.shipmentName,
        shipmentDate: form.shipmentDate || undefined,
        shippingCompanyName: form.shippingCompanyName,
      };
      return editingId
        ? apiClient.patch(`/imports/shipments/${editingId}`, payload)
        : apiClient.post('/imports/shipments', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/imports/shipments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shipments'] }),
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(e: MouseEvent, row: Shipment) {
    e.stopPropagation();
    setEditingId(row.id);
    setForm({
      shipmentName: row.shipmentName,
      shipmentDate: row.shipmentDate ?? '',
      shippingCompanyName: row.shippingCompanyName,
    });
    setModalOpen(true);
  }

  async function handleDelete(e: MouseEvent, row: Shipment) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.shipmentName }) });
    if (ok) deleteMutation.mutate(row.id);
  }

  const columns: Column<Shipment>[] = [
    { header: t('imports.shipmentName'), accessor: (r) => r.shipmentName },
    { header: t('imports.shipmentDate'), accessor: (r) => r.shipmentDate ?? '—' },
    { header: t('imports.shippingCompany'), accessor: (r) => r.shippingCompanyName },
    { header: t('imports.totalShipmentExpenses'), accessor: (r) => money(r.totalCost), align: 'right' },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button type="button" className="text-primary-600 hover:underline" onClick={(e) => openEdit(e, r)}>
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
        <Button onClick={openCreate}>+ {t('common.create')}</Button>
      </div>

      <DataTable
        columns={columns}
        data={shipmentsQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={shipmentsQuery.isLoading}
        onRowClick={(r) => navigate(`/suppliers/shipments/${r.id}`)}
      />

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        title={editingId ? t('common.edit') : t('common.create')}
      >
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <FormField label={t('imports.shipmentName')}>
            <Input
              required
              value={form.shipmentName}
              onChange={(e) => setForm({ ...form, shipmentName: e.target.value })}
            />
          </FormField>
          <FormField label={t('imports.shipmentDate')}>
            <Input
              type="date"
              value={form.shipmentDate}
              onChange={(e) => setForm({ ...form, shipmentDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('imports.shippingCompany')}>
            <Input
              required
              value={form.shippingCompanyName}
              onChange={(e) => setForm({ ...form, shippingCompanyName: e.target.value })}
            />
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
