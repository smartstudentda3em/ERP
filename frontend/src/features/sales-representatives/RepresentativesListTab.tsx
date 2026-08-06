import { MouseEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useActiveCompany } from '../../lib/use-active-company';

interface SalesRepresentative {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  branchId?: string | null;
  branch?: { nameEn: string; nameAr?: string | null } | null;
  commissionRate: number;
  isActive: boolean;
  userId?: string | null;
}

interface User {
  id: string;
  fullName: string;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr: string;
}

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  branchId: '',
  commissionRate: '0',
  userId: '',
  isActive: true,
};

export function RepresentativesListTab() {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canCreate = useAuthStore((s) => s.hasPermission('sales-representatives.create'));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  // Printing Press only — lets the user find a branch manager by their own name or by the branch
  // they're responsible for (e.g. "حمدي" or "فرع خيطان"), replacing DataTable's generic per-column
  // search so the placeholder can spell out both criteria explicitly.
  const [repSearch, setRepSearch] = useState('');

  const repsQuery = useQuery({
    queryKey: ['sales-representatives'],
    queryFn: () => unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives')),
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => unwrap<User[]>(apiClient.get('/users')),
    enabled: modalOpen,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: modalOpen && !!companyId,
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(rep: SalesRepresentative) {
    setEditingId(rep.id);
    setForm({
      name: rep.name,
      phone: rep.phone ?? '',
      email: rep.email ?? '',
      branchId: rep.branchId ?? '',
      commissionRate: String(rep.commissionRate ?? 0),
      userId: rep.userId ?? '',
      isActive: rep.isActive,
    });
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        phone: form.phone || undefined,
        email: form.email || undefined,
        branchId: form.branchId || null,
        commissionRate: Number(form.commissionRate || 0),
        userId: form.userId || undefined,
        isActive: form.isActive,
        companyId,
      };
      if (editingId) return apiClient.patch(`/sales-representatives/${editingId}`, payload);
      return apiClient.post('/sales-representatives', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-representatives'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sales-representatives/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-representatives'] });
    },
  });

  async function handleDelete(e: MouseEvent, rep: SalesRepresentative) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: rep.name }) });
    if (ok) deleteMutation.mutate(rep.id);
  }

  function repBranchLabel(r: SalesRepresentative): string {
    return r.branch?.nameAr || r.branch?.nameEn || '';
  }

  const filteredReps = useMemo(() => {
    const rows = repsQuery.data ?? [];
    if (!isPrintingPress || !repSearch.trim()) return rows;
    const q = repSearch.trim().toLowerCase();
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || repBranchLabel(r).toLowerCase().includes(q),
    );
  }, [repsQuery.data, isPrintingPress, repSearch]);

  const columns: Column<SalesRepresentative>[] = [
    { header: t('common.name'), accessor: (r) => r.name },
    ...(isPrintingPress
      ? [{ header: t('salesRepresentativesReports.branch'), accessor: (r: SalesRepresentative) => repBranchLabel(r) || '—' } as Column<SalesRepresentative>]
      : []),
    { header: t('fields.phone'), accessor: (r) => r.phone ?? '—' },
    { header: t('fields.email'), accessor: (r) => r.email ?? '—' },
    {
      header: t('fields.commissionRate'),
      accessor: (r) => `${formatAmount(r.commissionRate)}%`,
      align: 'right',
    },
    {
      header: t('common.status'),
      accessor: (r) => (
        <Badge color={r.isActive ? 'green' : 'gray'}>{r.isActive ? t('common.active') : t('common.inactive')}</Badge>
      ),
    },
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
            onClick={(e) => handleDelete(e, r)}
            disabled={deleteMutation.isPending}
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
      {canCreate && (
        <div className="mb-3 flex justify-end">
          <Button onClick={openCreate}>+ {t('common.create')}</Button>
        </div>
      )}

      {isPrintingPress && (
        <div className="mb-3 max-w-xs">
          <Input
            placeholder={t('salesRepresentativesReports.searchByNameOrBranchPress') ?? ''}
            value={repSearch}
            onChange={(e) => setRepSearch(e.target.value)}
          />
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredReps}
        keyField={(r) => r.id}
        isLoading={repsQuery.isLoading}
        searchable={!isPrintingPress}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingId
            ? t(isPrintingPress ? 'salesRepresentativesReports.editTitlePress' : 'salesRepresentativesReports.editTitle')
            : t(isPrintingPress ? 'salesRepresentativesReports.addTitlePress' : 'salesRepresentativesReports.addTitle')
        }
      >
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('common.name')}>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
          </div>
          <FormField label={t('fields.phone')}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label={t('fields.email')}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label={t('salesRepresentativesReports.branch')} required={isPrintingPress}>
            <Select
              required={isPrintingPress}
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="">
                {t(isPrintingPress ? 'salesRepresentativesReports.selectBranchRequired' : 'salesRepresentativesReports.selectBranch')}
              </option>
              {(branchesQuery.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nameAr || b.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('fields.commissionRate')}>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.commissionRate}
              onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('fields.linkedUserAccount')}>
              <Select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                <option value="">{t('fields.linkedUserAccountNone')}</option>
                {(usersQuery.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {t('common.active')}
          </label>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending}>
              {t(isPrintingPress ? 'salesRepresentativesReports.saveButtonPress' : 'salesRepresentativesReports.saveButton')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
