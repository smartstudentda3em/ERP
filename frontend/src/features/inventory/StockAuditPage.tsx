import { MouseEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { FormField, Input, Select } from '../../components/ui/Input';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import {
  monthKeyOf as auditMonthKey,
  monthNameOf as auditMonthName,
  monthNameOnly,
} from '../../lib/date-utils';

interface AuditRow {
  id: string;
  documentNumber: string;
  auditDate: string;
  status: 'CONFIRMED' | 'APPROVED';
  createdByName?: string;
  notes?: string | null;
  warehouse: {
    nameEn: string;
    nameAr?: string | null;
    branch?: { id: string; nameEn: string; nameAr?: string | null } | null;
  } | null;
  /** Live-computed by the backend (same formula as StockAuditDetailPage's own total), never stored. */
  totalConsumedValue: number;
}

interface Warehouse {
  id: string;
  nameEn: string;
  nameAr?: string | null;
  branchId?: string | null;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface Product {
  id: string;
  nameEn: string;
  purchasePrice: number;
  isActive: boolean;
  isSellable?: boolean;
}

interface StockLevel {
  quantityOnHand: number;
  product: { id: string };
  warehouse: { id: string };
}

interface LineDraft {
  productId: string;
  nameEn: string;
  systemQuantity: number;
  unitCost: number;
  actualQuantity: string;
}

const AUDIT_STATUS_COLOR: Record<string, 'gray' | 'green' | 'yellow'> = {
  CONFIRMED: 'yellow',
  APPROVED: 'green',
};

export function StockAuditPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canCreate = useAuthStore((s) => s.hasPermission('inventory.stockAudit.create'));
  const canEdit = useAuthStore((s) => s.hasPermission('inventory.stockAudit.edit'));
  const canDelete = useAuthStore((s) => s.hasPermission('inventory.stockAudit.delete'));
  const [entryOpen, setEntryOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [auditDate, setAuditDate] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  // Which branch/department of the (Printing-Press-only) company to filter to — a dropdown of
  // real branches rather than free-text, so it can only ever match an audit exactly (see
  // filteredAudits below) instead of a fuzzy name substring.
  const [branchFilter, setBranchFilter] = useState('');
  // Only the user's edits live in state, keyed by productId — the rest of each line (system
  // quantity, cost, pre-fill) is derived fresh from the products/stock-levels queries on every
  // render (see `lines` below), so a slow query resolving after the warehouse auto-selects can
  // never leave the table stuck empty.
  const [actualOverrides, setActualOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // A new audit always starts by picking Month/Year + Branch in this small setup modal — the
  // branch selection auto-resolves the one warehouse linked to it (see matchedWarehouseId below)
  // instead of asking the user to pick the warehouse separately.
  const now = new Date();
  const [newAuditModalOpen, setNewAuditModalOpen] = useState(false);
  const [newAuditForm, setNewAuditForm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, branchId: '' });

  const auditsQuery = useQuery({
    queryKey: ['stock-audits', companyId],
    queryFn: () => unwrap<AuditRow[]>(apiClient.get('/inventory/stock-audits', { params: { companyId } })),
    enabled: !!companyId && !entryOpen,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', companyId],
    queryFn: () => unwrap<Warehouse[]>(apiClient.get('/settings/warehouses', { params: { companyId } })),
    enabled: (entryOpen || newAuditModalOpen) && !!companyId,
  });

  // Fetched unconditionally (not just entryOpen/newAuditModalOpen) — the list view's own branch
  // filter dropdown below needs this too.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: !!companyId,
  });

  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => unwrap<Product[]>(apiClient.get('/inventory/products', { params: { companyId } })),
    enabled: entryOpen && !!companyId,
  });

  const levelsQuery = useQuery({
    queryKey: ['stock-levels', companyId],
    queryFn: () => unwrap<StockLevel[]>(apiClient.get('/inventory/stock/levels', { params: { companyId } })),
    enabled: entryOpen && !!companyId,
  });

  function branchLabel(b: Branch): string {
    return b.nameAr || b.nameEn;
  }

  function warehouseLabel(w: Warehouse): string {
    return w.nameAr || w.nameEn;
  }

  function openNewAuditModal() {
    setError(null);
    setNewAuditForm({ year: now.getFullYear(), month: now.getMonth() + 1, branchId: '' });
    setNewAuditModalOpen(true);
  }

  // The one warehouse linked (Warehouse.branchId) to the chosen branch — null/empty when that
  // branch has no warehouse mapped to it yet in Settings > Warehouses.
  const matchedWarehouseId = useMemo(() => {
    if (!newAuditForm.branchId) return '';
    return (warehousesQuery.data ?? []).find((w) => w.branchId === newAuditForm.branchId)?.id ?? '';
  }, [newAuditForm.branchId, warehousesQuery.data]);

  function confirmNewAudit() {
    if (!matchedWarehouseId) return;
    setError(null);
    setWarehouseId(matchedWarehouseId);
    setAuditDate(`${newAuditForm.year}-${String(newAuditForm.month).padStart(2, '0')}-01`);
    setActualOverrides({});
    setNewAuditModalOpen(false);
    setEntryOpen(true);
  }

  const lockedWarehouse = (warehousesQuery.data ?? []).find((w) => w.id === warehouseId);
  const lockedBranch = (branchesQuery.data ?? []).find((b) => b.id === lockedWarehouse?.branchId);

  function updateActual(productId: string, value: string) {
    setActualOverrides((prev) => ({ ...prev, [productId]: value }));
  }

  const lines: LineDraft[] | null = useMemo(() => {
    if (!warehouseId) return null;
    return (productsQuery.data ?? [])
      .filter((p) => p.isActive)
      .map((p) => {
        const level = levelsQuery.data?.find((l) => l.product?.id === p.id && l.warehouse?.id === warehouseId);
        const systemQuantity = level ? Number(level.quantityOnHand) : 0;
        const override = actualOverrides[p.id];
        return {
          productId: p.id,
          nameEn: p.nameEn,
          systemQuantity,
          unitCost: Number(p.purchasePrice),
          // Sellable materials are auto-tracked precisely via sales, so they pre-fill with the
          // system quantity (still editable, via actualOverrides once touched); manual materials
          // start blank for a real count.
          actualQuantity: override !== undefined ? override : p.isSellable ? String(systemQuantity) : '',
        };
      });
  }, [warehouseId, productsQuery.data, levelsQuery.data, actualOverrides]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/inventory/stock-audits', {
        auditDate,
        warehouseId,
        lines: (lines ?? []).map((l) => ({
          productId: l.productId,
          systemQuantity: l.systemQuantity,
          actualQuantity: l.actualQuantity.trim() === '' ? null : Number(l.actualQuantity),
          unitCost: l.unitCost,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-audits'] });
      setEntryOpen(false);
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  // Editing (month/notes/counted quantities) needs the full line table, which only the detail
  // page has already loaded — the Edit button here just navigates there instead of duplicating
  // that editor in a modal. Works the same for an already-APPROVED audit: the backend reverses
  // its originally-applied stock effect and reapplies a fresh adjustment for the new counts (see
  // StockAuditsService.update()).
  function openEditAudit(e: MouseEvent, r: AuditRow) {
    e.stopPropagation();
    navigate(`/inventory/stock-audit/${r.id}`);
  }

  // Deleting an already-APPROVED audit reverses its stock effect first (see
  // StockAuditsService.remove()) before the record itself is removed, so this needs the same
  // broad invalidation as the detail page's own approve/edit mutations.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inventory/stock-audits/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-audits'] });
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-summary'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-products'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? String(err?.message ?? err)),
  });

  async function handleDeleteAudit(e: MouseEvent, r: AuditRow) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: r.documentNumber }) });
    if (ok) deleteMutation.mutate(r.id);
  }

  // Every option is a month that actually has an audit, derived from the list itself rather than
  // a rolling calendar — so the dropdown never offers a month with nothing to show.
  const monthOptions = useMemo(() => {
    const keys = new Set((auditsQuery.data ?? []).map((r) => auditMonthKey(r.auditDate)));
    return [...keys].sort((a, b) => (a < b ? 1 : -1));
  }, [auditsQuery.data]);

  const filteredAudits = useMemo(() => {
    let rows = auditsQuery.data ?? [];
    if (monthFilter) rows = rows.filter((r) => auditMonthKey(r.auditDate) === monthFilter);
    if (branchFilter) rows = rows.filter((r) => r.warehouse?.branch?.id === branchFilter);
    return rows;
  }, [auditsQuery.data, monthFilter, branchFilter]);

  // إجمالي المواد المستهلكة: live sum of the "إجمالي المستهلك" column across whatever audits are
  // currently displayed (post month/branch filtering) — recomputes automatically the moment either
  // filter changes, since it derives straight from filteredAudits rather than the unfiltered list.
  const totalConsumedMaterials = useMemo(
    () => filteredAudits.reduce((sum, r) => sum + Number(r.totalConsumedValue ?? 0), 0),
    [filteredAudits],
  );

  const auditColumns: Column<AuditRow>[] = [
    {
      header: t('stockAudit.auditMonth'),
      accessor: (r) => t('stockAudit.auditMonthLabel', { month: auditMonthName(auditMonthKey(r.auditDate), i18n.language) }),
    },
    { header: t('fields.branch'), accessor: (r) => r.warehouse?.branch?.nameAr || r.warehouse?.branch?.nameEn || '—' },
    { header: t('fields.warehouse'), accessor: (r) => r.warehouse?.nameAr || r.warehouse?.nameEn || '—' },
    { header: t('common.date'), accessor: (r) => r.auditDate },
    { header: t('stockAudit.countedBy'), accessor: (r) => r.createdByName ?? '—' },
    {
      header: t('stockAudit.totalConsumedValue'),
      accessor: (r) => formatAmount(r.totalConsumedValue),
      align: 'right',
    },
    {
      header: t('common.status'),
      accessor: (r) => (
        <Badge color={AUDIT_STATUS_COLOR[r.status]}>{t(`stockAudit.documentStatus.${r.status}`, r.status)}</Badge>
      ),
      align: 'center',
    },
    ...(canEdit || canDelete
      ? [
          {
            header: t('common.actions'),
            // Available for both CONFIRMED and APPROVED audits — editing/deleting an APPROVED one
            // just also reverses/recomputes its real stock effect server-side (see
            // StockAuditsService.update()/remove()), rather than being blocked outright.
            accessor: (r: AuditRow) => (
              <div className="flex justify-center gap-3">
                {canEdit && (
                  <button
                    type="button"
                    className="text-primary-600 hover:underline"
                    onClick={(e) => openEditAudit(e, r)}
                  >
                    {t('common.edit')}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => handleDeleteAudit(e, r)}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            ),
            align: 'center',
          } as Column<AuditRow>,
        ]
      : []),
  ];

  const varianceOf = (l: LineDraft): number | null =>
    l.actualQuantity.trim() === '' ? null : Number(l.actualQuantity) - l.systemQuantity;

  const lineColumns: Column<LineDraft>[] = useMemo(
    () => [
      { header: t('fields.product'), accessor: (r) => r.nameEn },
      { header: t('stockAudit.systemQuantity'), accessor: (r) => r.systemQuantity, align: 'right' },
      {
        header: t('stockAudit.actualQuantity'),
        accessor: (r) => (
          <Input
            type="number"
            step="0.0001"
            value={r.actualQuantity}
            onChange={(e) => updateActual(r.productId, e.target.value)}
            className="w-28"
          />
        ),
        align: 'center',
      },
      {
        header: t('stockAudit.variance'),
        accessor: (r) => {
          const v = varianceOf(r);
          if (v === null) return '—';
          const color = v > 0 ? 'text-green-600' : v < 0 ? 'text-red-600' : 'text-[var(--text-muted)]';
          return <span className={color}>{v > 0 ? `+${v}` : v}</span>;
        },
        align: 'right',
      },
      {
        header: t('stockAudit.lineStatus'),
        accessor: (r) => {
          if (r.actualQuantity.trim() === '') return <Badge color="gray">{t('stockAudit.pendingCount')}</Badge>;
          const v = varianceOf(r) ?? 0;
          return (
            <Badge color={v === 0 ? 'green' : v > 0 ? 'blue' : 'red'}>
              {v === 0 ? t('stockAudit.matched') : v > 0 ? t('stockAudit.surplus') : t('stockAudit.shortage')}
            </Badge>
          );
        },
        align: 'center',
      },
    ],
    [t],
  );

  if (entryOpen) {
    return (
      <div>
        <PageHeader title={t('stockAudit.newAudit')} />
        <Button variant="secondary" onClick={() => setEntryOpen(false)} className="mb-3">
          {t('stockAudit.backToList')}
        </Button>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('fields.branch')}</div>
            <div className="mt-1 font-semibold">{lockedBranch ? branchLabel(lockedBranch) : '—'}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('fields.warehouse')}</div>
            <div className="mt-1 font-semibold">{lockedWarehouse ? warehouseLabel(lockedWarehouse) : '—'}</div>
          </Card>
          <Card>
            <div className="text-xs text-[var(--text-muted)]">{t('stockAudit.auditMonth')}</div>
            <div className="mt-1 font-semibold">{auditMonthName(auditMonthKey(auditDate), i18n.language)}</div>
          </Card>
        </div>

        {lines && (
          <>
            <DataTable columns={lineColumns} data={lines} keyField={(r) => r.productId} searchable={false} />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEntryOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || lines.length === 0}>
                {t('stockAudit.saveAndSubmit')}
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('nav.stockAudit')}
        actions={canCreate ? <Button onClick={openNewAuditModal}>+ {t('stockAudit.newAudit')}</Button> : undefined}
      />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FormField label={t('stockAudit.auditMonth')}>
          <Select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="">{t('stockAudit.allMonths')}</option>
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {auditMonthName(key, i18n.language)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label={t('fields.branch')}>
          <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="">{t('stockAudit.allBranches')}</option>
            {(branchesQuery.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {branchLabel(b)}
              </option>
            ))}
          </Select>
        </FormField>
        <div className="flex items-end">
          <div className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm">
            <span className="text-[var(--text-muted)]">{t('stockAudit.totalConsumedMaterials')}</span>
            <span className="font-semibold">{formatAmount(totalConsumedMaterials)}</span>
          </div>
        </div>
      </div>
      <DataTable
        columns={auditColumns}
        data={filteredAudits}
        keyField={(r) => r.id}
        isLoading={auditsQuery.isLoading}
        searchable={false}
        onRowClick={(r) => navigate(`/inventory/stock-audit/${r.id}`)}
      />

      <Modal open={newAuditModalOpen} onClose={() => setNewAuditModalOpen(false)} title={t('stockAudit.newAudit')}>
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('stockAudit.auditMonth')}>
            <Select
              value={newAuditForm.month}
              onChange={(e) => setNewAuditForm({ ...newAuditForm, month: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {monthNameOnly(m, i18n.language)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('common.year')}>
            <Input
              type="number"
              value={newAuditForm.year}
              onChange={(e) => setNewAuditForm({ ...newAuditForm, year: Number(e.target.value) || now.getFullYear() })}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('fields.branch')}>
              <Select
                required
                value={newAuditForm.branchId}
                onChange={(e) => setNewAuditForm({ ...newAuditForm, branchId: e.target.value })}
              >
                <option value="">{t('actions.selectBranch')}</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {branchLabel(b)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          {newAuditForm.branchId && !matchedWarehouseId && (
            <p className="col-span-2 text-sm text-red-600">{t('stockAudit.noWarehouseForBranch')}</p>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setNewAuditModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={confirmNewAudit} disabled={!matchedWarehouseId}>
              {t('common.confirm')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
