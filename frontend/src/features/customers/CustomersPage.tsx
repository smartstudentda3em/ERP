import { MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface Customer {
  id: string;
  name: string;
  mobile?: string;
  address?: string;
  openingBalance: number;
  totalPurchases: number;
  totalPaid: number;
  balanceDue: number;
  creditStatus?: 'RELIABLE' | 'BLOCKED';
  blockedReason?: string | null;
}

const emptyForm = { name: '', mobile: '', address: '', creditStatus: 'RELIABLE' as 'RELIABLE' | 'BLOCKED', blockedReason: '' };

export function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: !!companyId,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...form, blockedReason: form.creditStatus === 'BLOCKED' ? form.blockedReason || null : null, companyId };
      return editingId ? apiClient.patch(`/customers/${editingId}`, payload) : apiClient.post('/customers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(e: MouseEvent, customer: Customer) {
    e.stopPropagation();
    setEditingId(customer.id);
    setForm({
      name: customer.name,
      mobile: customer.mobile ?? '',
      address: customer.address ?? '',
      creditStatus: customer.creditStatus ?? 'RELIABLE',
      blockedReason: customer.blockedReason ?? '',
    });
    setError(null);
    setModalOpen(true);
  }

  async function handleDelete(e: MouseEvent, customer: Customer) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: customer.name }) });
    if (ok) deleteMutation.mutate(customer.id);
  }

  const columns: Column<Customer>[] = [
    { header: t('common.name'), accessor: (r) => r.name, width: '13%' },
    { header: t('fields.mobile'), accessor: (r) => r.mobile ?? '—', width: '11%' },
    { header: t('fields.address'), accessor: (r) => r.address ?? '—', width: '35%' },
    {
      header: t('fields.totalPurchases'),
      accessor: (r) => formatAmount(r.totalPurchases),
      align: 'right',
      width: '13%',
    },
    {
      header: t('fields.paidAmount'),
      accessor: (r) => formatAmount(r.totalPaid),
      align: 'right',
      width: '13%',
    },
    {
      header: t('actions.balanceDue'),
      accessor: (r) => (
        // The table row itself still navigates to /statement on click (onRowClick below) — this
        // span stops that propagation so the balance figure is truly inert, not just unstyled.
        <span className="cursor-default" onClick={(e) => e.stopPropagation()}>
          {formatAmount(r.balanceDue)}
        </span>
      ),
      align: 'right',
      width: '13%',
    },
    {
      header: t('installments.customerStatus'),
      accessor: (r) =>
        r.creditStatus === 'BLOCKED' ? (
          <Badge color="red">{t('installments.blocked')}</Badge>
        ) : (
          <Badge color="green">{t('installments.reliable')}</Badge>
        ),
      width: '10%',
    },
    {
      header: t('common.details'),
      accessor: (r) => (
        <button
          type="button"
          className="text-primary-600 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/customers/${r.id}/outstanding-balance`);
          }}
        >
          {t('common.details')}
        </button>
      ),
      align: 'center',
      width: '10%',
    },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={(e) => openEdit(e, r)}
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            onClick={(e) => handleDelete(e, r)}
            disabled={deleteMutation.isPending}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
      width: '15%',
    },
  ];

  return (
    <div>
      <PageHeader title={t('nav.customers')} actions={<Button onClick={openCreate}>+ {t('common.create')}</Button>} />

      <DataTable
        columns={columns}
        data={customersQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={customersQuery.isLoading}
        onRowClick={(r) => navigate(`/customers/${r.id}/statement`)}
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
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <FormField label={t('common.name')}>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label={t('fields.mobile')}>
            <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </FormField>
          <FormField label={t('fields.addressOptional')}>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          <FormField label={t('installments.customerStatus')}>
            <Select
              value={form.creditStatus}
              onChange={(e) => setForm({ ...form, creditStatus: e.target.value as 'RELIABLE' | 'BLOCKED' })}
            >
              <option value="RELIABLE">{t('installments.reliable')}</option>
              <option value="BLOCKED">{t('installments.blocked')}</option>
            </Select>
          </FormField>
          {form.creditStatus === 'BLOCKED' && (
            <FormField label={t('installments.blockedReason')}>
              <Input value={form.blockedReason} onChange={(e) => setForm({ ...form, blockedReason: e.target.value })} />
            </FormField>
          )}
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
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
