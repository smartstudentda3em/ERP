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
import { useToast } from '../../components/ui/Toast';
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

interface CommissionException {
  id: string;
  productId: string | null;
  categoryId: string | null;
  commissionRate: number;
  product?: { nameEn: string; nameAr?: string | null } | null;
  category?: { nameEn: string; nameAr?: string | null } | null;
}

interface ProductOption {
  id: string;
  nameEn: string;
  nameAr?: string | null;
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

interface RepresentativesListTabProps {
  /** Narrows the list to only rows whose linked login account holds this exact role — Printing
   * Press's "مدراء الفروع"/"المناديب" split (see SalesRepresentativesPage.tsx). Omitted everywhere
   * else, which keeps today's unfiltered behavior. */
  roleNameFilter?: string;
}

export function RepresentativesListTab({ roleNameFilter }: RepresentativesListTabProps = {}) {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canCreate = useAuthStore((s) => s.hasPermission('sales-representatives.create'));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [exceptionTargetId, setExceptionTargetId] = useState('');
  const [exceptionRate, setExceptionRate] = useState('');
  // Printing Press only — clicking anywhere on a manager's row (except the Edit/Delete actions,
  // which stopPropagation) opens a separate view-only modal listing their commission exceptions.
  // Adding/removing exceptions still only happens from the edit-manager modal above.
  const [viewingRep, setViewingRep] = useState<SalesRepresentative | null>(null);
  // Printing Press only — lets the user find a branch manager by their own name or by the branch
  // they're responsible for (e.g. "حمدي" or "فرع خيطان"), replacing DataTable's generic per-column
  // search so the placeholder can spell out both criteria explicitly.
  const [repSearch, setRepSearch] = useState('');

  const repsQuery = useQuery({
    queryKey: ['sales-representatives', roleNameFilter ?? 'all'],
    queryFn: () =>
      unwrap<SalesRepresentative[]>(
        apiClient.get('/sales-representatives', { params: roleNameFilter ? { roleName: roleNameFilter } : undefined }),
      ),
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

  const exceptionsQuery = useQuery({
    queryKey: ['sales-representatives', editingId, 'commission-exceptions'],
    queryFn: () => unwrap<CommissionException[]>(apiClient.get(`/sales-representatives/${editingId}/commission-exceptions`)),
    enabled: modalOpen && !!editingId,
  });

  // Same query shape/key as exceptionsQuery above (by design — the two share the TanStack Query
  // cache when the same rep is both viewed and then edited, no duplicate fetch), just driven by
  // viewingRep instead of editingId so the read-only view modal doesn't need the edit modal open.
  const viewExceptionsQuery = useQuery({
    queryKey: ['sales-representatives', viewingRep?.id, 'commission-exceptions'],
    queryFn: () =>
      unwrap<CommissionException[]>(apiClient.get(`/sales-representatives/${viewingRep!.id}/commission-exceptions`)),
    enabled: !!viewingRep,
  });

  // Primary source: the "المنتجات" catalog (the same list the المشتريات↔المخازن nav item shows) —
  // CATALOG_ITEM rows for Printing Press, or the plain products list for every other company (which
  // has no separate catalog/raw-material split to begin with). Merged with the raw-materials list
  // (Purchasing's own "المواد الخام" tab) only for Printing Press, since that's the one company where
  // the two are genuinely disjoint tables — mirrors the exact same sourcing SalesLineEditor.tsx uses.
  const exceptionCatalogQuery = useQuery({
    queryKey: isPrintingPress ? ['printing-products-catalog'] : ['products'],
    queryFn: () =>
      unwrap<ProductOption[]>(apiClient.get(isPrintingPress ? '/inventory/products/catalog' : '/inventory/products')),
    enabled: modalOpen && !!editingId,
  });
  const exceptionRawMaterialsQuery = useQuery({
    queryKey: ['inventory-products-for-commission', companyId],
    queryFn: () => unwrap<ProductOption[]>(apiClient.get('/inventory/products', { params: { companyId } })),
    enabled: modalOpen && !!editingId && isPrintingPress,
  });
  const exceptionProducts = useMemo(() => {
    const merged = [...(exceptionCatalogQuery.data ?? []), ...(isPrintingPress ? exceptionRawMaterialsQuery.data ?? [] : [])];
    const seen = new Set<string>();
    return merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [exceptionCatalogQuery.data, exceptionRawMaterialsQuery.data, isPrintingPress]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setExceptionTargetId('');
    setExceptionRate('');
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
    setExceptionTargetId('');
    setExceptionRate('');
    setModalOpen(true);
  }

  const addExceptionMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/sales-representatives/${editingId}/commission-exceptions`, {
        productId: exceptionTargetId,
        commissionRate: Number(exceptionRate || 0),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-representatives', editingId, 'commission-exceptions'] });
      setExceptionTargetId('');
      setExceptionRate('');
      toast.success(t('common.addedSuccessfully'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const removeExceptionMutation = useMutation({
    mutationFn: (exceptionId: string) =>
      apiClient.delete(`/sales-representatives/${editingId}/commission-exceptions/${exceptionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-representatives', editingId, 'commission-exceptions'] });
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  function exceptionTargetLabel(ex: CommissionException): string {
    if (ex.productId) return ex.product?.nameAr || ex.product?.nameEn || ex.productId;
    return ex.category?.nameAr || ex.category?.nameEn || ex.categoryId || '';
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
        onRowClick={isPrintingPress ? (r) => setViewingRep(r) : undefined}
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
          <p className="col-span-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
            {t('salesRepresentativesReports.employeeSyncNote')}
          </p>
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
          <div className="col-span-2 rounded-lg border border-[var(--border)] p-3">
            <div className="mb-2 text-sm font-medium text-[var(--text)]">{t('commissionExceptions.title')}</div>
            {!editingId ? (
              <p className="text-sm text-[var(--text-muted)]">{t('commissionExceptions.saveFirstHint')}</p>
            ) : (
              <>
                <div className="mb-2 flex flex-col gap-1.5">
                  {(exceptionsQuery.data ?? []).length === 0 && (
                    <span className="text-sm text-[var(--text-muted)]">{t('commissionExceptions.noneYet')}</span>
                  )}
                  {(exceptionsQuery.data ?? []).map((ex) => (
                    <div
                      key={ex.id}
                      className="flex items-center justify-between rounded bg-gray-100 px-2.5 py-1 text-sm dark:bg-gray-800"
                    >
                      <span>
                        {t(ex.productId ? 'commissionExceptions.typeProduct' : 'commissionExceptions.typeCategory')}
                        {': '}
                        {exceptionTargetLabel(ex)} — {formatAmount(ex.commissionRate)}%
                      </span>
                      <button
                        type="button"
                        className="text-gray-500 hover:text-red-600 disabled:opacity-50"
                        disabled={removeExceptionMutation.isPending}
                        onClick={() => removeExceptionMutation.mutate(ex.id)}
                        aria-label={t('common.delete') ?? ''}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Select value={exceptionTargetId} onChange={(e) => setExceptionTargetId(e.target.value)}>
                    <option value="">{t('commissionExceptions.selectTarget')}</option>
                    {exceptionProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nameAr || p.nameEn}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="w-24"
                    placeholder={t('fields.commissionRate') ?? ''}
                    value={exceptionRate}
                    onChange={(e) => setExceptionRate(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!exceptionTargetId || !exceptionRate || addExceptionMutation.isPending}
                    onClick={() => addExceptionMutation.mutate()}
                  >
                    + {t('common.add')}
                  </Button>
                </div>
              </>
            )}
          </div>
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

      <Modal
        open={!!viewingRep}
        onClose={() => setViewingRep(null)}
        title={t('commissionExceptions.viewTitle', { name: viewingRep?.name ?? '' })}
      >
        <div className="flex flex-col gap-1.5">
          {viewExceptionsQuery.isLoading && (
            <span className="text-sm text-[var(--text-muted)]">{t('common.loading')}</span>
          )}
          {!viewExceptionsQuery.isLoading && (viewExceptionsQuery.data ?? []).length === 0 && (
            <span className="text-sm text-[var(--text-muted)]">{t('commissionExceptions.noneYet')}</span>
          )}
          {(viewExceptionsQuery.data ?? []).map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between rounded bg-gray-100 px-2.5 py-1.5 text-sm dark:bg-gray-800"
            >
              <span>
                {t(ex.productId ? 'commissionExceptions.typeProduct' : 'commissionExceptions.typeCategory')}
                {': '}
                {exceptionTargetLabel(ex)}
              </span>
              <span className="font-medium">{formatAmount(ex.commissionRate)}%</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
