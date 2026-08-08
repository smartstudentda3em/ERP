import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useToast } from '../../components/ui/Toast';
import { useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useActiveCompany } from '../../lib/use-active-company';

interface Partner {
  id: string;
  name: string;
  sharePercentage: number;
  isActive: boolean;
  branchId: string | null;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

const emptyForm = { name: '', sharePercentage: '', branchId: '' };

export function PartnersTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { isPrintingPress } = useActiveCompany();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  // Printing Press only — narrows the table (and the 100%-cap math shown while typing) to one
  // branch's own cap table at a time, since each branch now has its own independent 100%.
  const [branchFilter, setBranchFilter] = useState('');

  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  // Press partners always belong to a real branch (server-enforced), so leaving this on "all
  // branches" (branchFilter === '') makes the summary line below compare against a branchId of
  // null that no Press partner can ever have — silently showing 0% / 100% remaining regardless
  // of how many partners actually exist. Defaulting to the first branch as soon as the branch
  // list loads keeps the summary meaningful without needing the user to pick one manually first.
  useEffect(() => {
    if (isPrintingPress && !branchFilter && branchesQuery.data && branchesQuery.data.length > 0) {
      setBranchFilter(branchesQuery.data[0].id);
    }
  }, [isPrintingPress, branchFilter, branchesQuery.data]);

  // Unfiltered — the table's own branch filter and the form's own live 100%-cap math both need
  // the full list to group/recompute against, independent of whichever branch the table is
  // currently narrowed to.
  const partnersQuery = useQuery({
    queryKey: ['partners', companyId],
    queryFn: () => unwrap<Partner[]>(apiClient.get('/settings/partners')),
    enabled: !!companyId,
  });

  const partners = partnersQuery.data ?? [];
  const displayedPartners = useMemo(
    () => (isPrintingPress && branchFilter ? partners.filter((p) => p.branchId === branchFilter) : partners),
    [partners, isPrintingPress, branchFilter],
  );

  // The 100%-cap scope: company-wide for every company, but Printing Press splits it per branch —
  // so the running total/warning shown while adding or editing a partner must only ever sum the
  // OTHER partners sharing the exact same branchId as the form currently has selected (null for
  // every non-Press company, matching the single company-wide cap table it always had).
  const formBranchId = isPrintingPress ? form.branchId || null : null;
  const currentTotal = useMemo(
    () =>
      partners
        .filter((p) => p.id !== editingId && (p.branchId ?? null) === formBranchId)
        .reduce((sum, p) => sum + Number(p.sharePercentage ?? 0), 0),
    [partners, editingId, formBranchId],
  );
  const projectedTotal = currentTotal + Number(form.sharePercentage || 0);
  const willExceed = projectedTotal > 100;

  // The persistent summary line above the table reflects whichever branch the TABLE itself is
  // currently filtered to (branchFilter), not the add/edit modal's own (usually closed) branch
  // field — otherwise it would permanently read "0%" for Press, since a closed modal's branchId
  // is always empty. Company-wide for every non-Press company, exactly as it always was.
  const headerBranchId = isPrintingPress ? branchFilter || null : null;
  const headerTotal = useMemo(
    () =>
      partners
        .filter((p) => (p.branchId ?? null) === headerBranchId)
        .reduce((sum, p) => sum + Number(p.sharePercentage ?? 0), 0),
    [partners, headerBranchId],
  );
  // The capital-injection split (Partners > Contributions) only ever uses active partners, and
  // requires their shares to total exactly 100% within their own scope (branch, for Press).
  const activeTotal = useMemo(
    () =>
      partners
        .filter((p) => p.isActive && (p.branchId ?? null) === headerBranchId)
        .reduce((sum, p) => sum + Number(p.sharePercentage ?? 0), 0),
    [partners, headerBranchId],
  );
  const isComplete = Math.abs(activeTotal - 100) < 0.01;

  function branchName(id: string | null): string {
    if (!id) return '—';
    const b = (branchesQuery.data ?? []).find((br) => br.id === id);
    return b ? b.nameAr || b.nameEn : '—';
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, branchId: isPrintingPress ? branchFilter : '' });
    setModalOpen(true);
  }

  function openEdit(row: Partner) {
    setEditingId(row.id);
    setForm({ name: row.name, sharePercentage: String(row.sharePercentage ?? ''), branchId: row.branchId ?? '' });
    setModalOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        sharePercentage: Number(form.sharePercentage),
        branchId: isPrintingPress ? form.branchId || undefined : undefined,
      };
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
    ...(isPrintingPress
      ? [{ header: t('fields.branch'), accessor: (r: Partner) => branchName(r.branchId) } as Column<Partner>]
      : []),
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-[var(--text-muted)]">
          {t('partners.totalShare')}: <span className="font-medium text-[var(--text)]">{formatAmount(headerTotal)}%</span>
          {' — '}
          <span className={isComplete ? 'text-green-600' : 'text-amber-600'}>
            {isComplete ? t('partners.sharesComplete') : t('partners.sharesIncomplete', { remaining: formatAmount(100 - activeTotal) })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
                <option value="">{t('accounting.allBranches')}</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <Button onClick={openCreate}>+ {t('partners.addNew')}</Button>
        </div>
      </div>

      <DataTable columns={columns} data={displayedPartners} keyField={(r) => r.id} isLoading={partnersQuery.isLoading} />

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
          {isPrintingPress && (
            <div className="col-span-2">
              <FormField label={t('fields.branch')}>
                <Select
                  required
                  value={form.branchId}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                >
                  <option value="">{t('actions.selectBranch')}</option>
                  {(branchesQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameAr || b.nameEn}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          )}
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
            <Button
              type="submit"
              disabled={saveMutation.isPending || willExceed || (isPrintingPress && !form.branchId)}
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
