import { MouseEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount, roundTo } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany, useIsSalesRep, useIsBranchManager } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge, statusColor } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';
import { SalesLineEditor, SalesLineForm, emptyLine, linesToPayload, computeGrandTotal } from './SalesLineEditor';
import { useSalesRepLock } from './useSalesRepLock';

// Once a quotation moves past DRAFT, editing/deleting it is restricted to a true Administrator —
// mirrors QuotationsService.assertMayModify() on the backend, which is the actual enforcement
// boundary; this just keeps the buttons from inviting a click that would 403 anyway.
const FREELY_EDITABLE_STATUSES = ['DRAFT'];
const NON_CONVERTIBLE_STATUSES = ['INVOICED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'];

interface QuotationLine {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

interface Quotation {
  id: string;
  documentNumber: string;
  quotationDate: string;
  status: string;
  grandTotal: number;
  customerId?: string;
  branchId?: string | null;
  salesRepresentativeId?: string | null;
  notes?: string | null;
  customer: { name: string };
  salesRepresentative: { name: string } | null;
  lines?: QuotationLine[];
}

interface Customer {
  id: string;
  name: string;
  code?: string;
}

interface SalesRepresentative {
  id: string;
  name: string;
  userId?: string | null;
}

export function QuotationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const isSystemRole = useAuthStore((s) => s.user?.isSystemRole) ?? false;
  const hasPermission = useAuthStore((s) => s.hasPermission);
  // مدير فرع only holds sales.quotation.view/create (no edit/delete/approve) — the status-based
  // canModify/canConvert rules below decide WHEN a modification is allowed in principle, but a role
  // lacking the underlying permission must never see the button at all, or it 403s on click.
  const canEditQuotation = hasPermission('sales.quotation.edit');
  const canDeleteQuotation = hasPermission('sales.quotation.delete');
  const canApproveQuotation = hasPermission('sales.quotation.approve');
  // مندوب/مدير فرع on their mobile app: no Print (no printer on a phone) and no Convert-to-Invoice
  // row-shortcut (that's an app-owner/admin workflow decision, not a quick field action) — both
  // stay for every other role, on desktop, matching the same restriction on the invoice pages.
  const isMobileRestrictedRole = useIsSalesRep() || useIsBranchManager();
  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [salesRepresentativeId, setSalesRepresentativeId] = useState('');
  const [quotationDate, setQuotationDate] = useState(localToday());
  const [lines, setLines] = useState<SalesLineForm[]>([emptyLine()]);

  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editSalesRepresentativeId, setEditSalesRepresentativeId] = useState('');
  const [editQuotationDate, setEditQuotationDate] = useState(localToday());
  const [editLines, setEditLines] = useState<SalesLineForm[]>([emptyLine()]);

  const quotationsQuery = useQuery({
    queryKey: ['quotations', companyId],
    queryFn: () => unwrap<Quotation[]>(apiClient.get('/sales/quotations', { params: { companyId } })),
    enabled: !!companyId,
  });

  // Fetched fresh only when the edit modal opens — the list query above doesn't carry line items.
  const editingQuotationQuery = useQuery({
    queryKey: ['quotation', editingQuotationId],
    queryFn: () => unwrap<Quotation>(apiClient.get(`/sales/quotations/${editingQuotationId}`)),
    enabled: !!editingQuotationId,
  });

  useEffect(() => {
    const q = editingQuotationQuery.data;
    if (!q) return;
    setEditCustomerId(q.customerId ?? '');
    setEditSalesRepresentativeId(q.salesRepresentativeId ?? '');
    setEditQuotationDate(q.quotationDate);
    setEditLines(
      (q.lines ?? []).map((l) => ({
        productId: l.productId,
        quantity: String(l.quantity),
        unitPrice: String(l.unitPrice),
        unitKind: 'UNIT' as const,
        lineTotal: String(roundTo(l.quantity * l.unitPrice)),
        pendingTotalOverride: false,
      })),
    );
  }, [editingQuotationQuery.data]);

  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: (modalOpen || !!editingQuotationId) && !!companyId,
  });

  const salesRepsQuery = useQuery({
    queryKey: ['sales-representatives'],
    queryFn: () => unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives')),
    enabled: modalOpen || !!editingQuotationId,
  });

  const { isAdmin, ownRep, currentUserName } = useSalesRepLock(salesRepsQuery.data);
  const effectiveSalesRepId = isAdmin ? salesRepresentativeId : ownRep?.id ?? '';
  const effectiveEditSalesRepId = isAdmin ? editSalesRepresentativeId : ownRep?.id ?? '';

  const customerOptions = useMemo(
    () => (customersQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [customersQuery.data],
  );
  const repOptions = useMemo(
    () => (salesRepsQuery.data ?? []).map((r) => ({ value: r.id, label: r.name })),
    [salesRepsQuery.data],
  );
  // Non-admin مندوب/مدير فرع: the rep field is locked to their own identity — a single
  // non-clearable option instead of the full searchable list, matching useSalesRepLock's contract.
  const lockedRepOptions = useMemo(
    () => (ownRep ? [{ value: ownRep.id, label: ownRep.name }] : currentUserName ? [{ value: '', label: currentUserName }] : []),
    [ownRep, currentUserName],
  );

  // Printing Press has no Customers screen at all (confirmed scope: every other company is
  // unaffected) — every quotation there is silently attributed to the one seeded walk-in customer.
  const { isPrintingPress } = useActiveCompany();
  const walkInCustomer = customersQuery.data?.find((c) => c.code === 'WALKIN');
  useEffect(() => {
    if (isPrintingPress && walkInCustomer && !customerId) setCustomerId(walkInCustomer.id);
  }, [isPrintingPress, walkInCustomer, customerId]);

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/sales/quotations', {
        quotationDate,
        customerId,
        companyId,
        salesRepresentativeId: effectiveSalesRepId || undefined,
        lines: linesToPayload(lines),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setModalOpen(false);
      setCustomerId('');
      setSalesRepresentativeId('');
      setLines([emptyLine()]);
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/sales/quotations/${editingQuotationId}`, {
        quotationDate: editQuotationDate,
        customerId: editCustomerId,
        salesRepresentativeId: effectiveEditSalesRepId || undefined,
        lines: linesToPayload(editLines),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      setEditingQuotationId(null);
      toast.success(t('quotations.updated'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sales/quotations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      toast.success(t('quotations.deleted'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/sales/quotations/${id}/convert-to-invoice`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success(t('quotations.converted'));
      const invoiceId = res.data?.data?.id ?? res.data?.id;
      if (invoiceId) navigate(`/sales/invoices/${invoiceId}`);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  async function handleDelete(e: MouseEvent, q: Quotation) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: q.documentNumber }) });
    if (ok) deleteMutation.mutate(q.id);
  }

  async function handleConvert(e: MouseEvent, q: Quotation) {
    e.stopPropagation();
    const ok = await confirm({
      title: t('quotations.convertToInvoice'),
      message: t('quotations.confirmConvert', { name: q.documentNumber }),
    });
    if (ok) convertMutation.mutate(q.id);
  }

  const columns: Column<Quotation>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.quotationDate },
    { header: t('nav.customers'), accessor: (r) => r.customer?.name },
    { header: t(isPrintingPress ? 'fields.salesRepresentativePress' : 'fields.salesRepresentative'), accessor: (r) => r.salesRepresentative?.name ?? '—' },
    {
      header: t('common.status'),
      accessor: (r) => <Badge color={statusColor(r.status)}>{t(`docStatus.${r.status}`, r.status)}</Badge>,
    },
    { header: t('common.total'), accessor: (r) => formatAmount(r.grandTotal), align: 'right' },
    {
      header: t('common.actions'),
      isActions: true,
      accessor: (r) => {
        // Once a quotation is past DRAFT, only a true Administrator may still edit/delete it —
        // mirrors QuotationsService.assertMayModify(), the actual server-side enforcement. That
        // status rule is independent from (and applied on top of) the caller's actual permissions.
        const statusAllowsModify = FREELY_EDITABLE_STATUSES.includes(r.status) || isSystemRole;
        const canEdit = statusAllowsModify && canEditQuotation;
        const canDelete = statusAllowsModify && canDeleteQuotation;
        const canConvert = !NON_CONVERTIBLE_STATUSES.includes(r.status) && canApproveQuotation && !isMobileRestrictedRole;
        return (
          <div className="flex flex-wrap justify-center gap-3">
            {canEdit && (
              <button
                type="button"
                className="text-primary-600 hover:underline"
                title={t('common.edit')}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingQuotationId(r.id);
                }}
              >
                ✏️ {t('common.edit')}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="text-red-600 hover:underline"
                title={t('common.delete')}
                onClick={(e) => handleDelete(e, r)}
                disabled={deleteMutation.isPending}
              >
                🗑️ {t('common.delete')}
              </button>
            )}
            {canConvert && (
              <button
                type="button"
                className="text-green-600 hover:underline"
                title={t('quotations.convertToInvoice')}
                onClick={(e) => handleConvert(e, r)}
                disabled={convertMutation.isPending}
              >
                🧾 {t('quotations.convertToInvoice')}
              </button>
            )}
            {!isMobileRestrictedRole && (
              <button
                type="button"
                className="text-primary-600 hover:underline"
                title={t('common.print')}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/sales/quotations/${r.id}?autoprint=1`);
                }}
              >
                🖨️ {t('common.print')}
              </button>
            )}
            <button
              type="button"
              className="text-primary-600 hover:underline"
              title={t('actions.shareInvoice')}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/sales/quotations/${r.id}?autopdf=1`);
              }}
            >
              📤 {t('actions.shareInvoice')}
            </button>
          </div>
        );
      },
      align: 'center',
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.quotations')}
        actions={<Button onClick={() => setModalOpen(true)}>+ {t('common.create')}</Button>}
      />

      <DataTable
        columns={columns}
        data={quotationsQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={quotationsQuery.isLoading}
        onRowClick={(r) => navigate(`/sales/quotations/${r.id}`)}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('common.create')} widthClass="max-w-4xl">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {!isPrintingPress && (
              <FormField label={t('nav.customers')}>
                <SearchableSelect
                  options={customerOptions}
                  value={customerId}
                  onChange={setCustomerId}
                  placeholder={t('actions.selectCustomer') ?? ''}
                  required
                  clearable
                />
              </FormField>
            )}
            <FormField label={t(isPrintingPress ? 'fields.salesRepresentativePress' : 'fields.salesRepresentative')}>
              <SearchableSelect
                options={isAdmin ? repOptions : lockedRepOptions}
                value={effectiveSalesRepId}
                onChange={setSalesRepresentativeId}
                placeholder={t(isPrintingPress ? 'actions.selectSalesRepPress' : 'actions.selectSalesRep') ?? ''}
                disabled={!isAdmin}
                clearable={isAdmin}
              />
            </FormField>
            <FormField label={t('common.date')}>
              <Input type="date" required value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
            </FormField>
          </div>

          <SalesLineEditor lines={lines} onChange={setLines} layout="table" />

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="card flex items-center justify-between gap-4 px-4 py-3 sm:w-64">
              <span className="text-sm font-medium text-[var(--text-muted)]">{t('common.total')}</span>
              <span className="text-2xl font-bold text-[var(--text)]">{formatAmount(computeGrandTotal(lines))}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingQuotationId} onClose={() => setEditingQuotationId(null)} title={t('common.edit')} widthClass="max-w-4xl">
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {!isPrintingPress && (
              <FormField label={t('nav.customers')}>
                <SearchableSelect
                  options={customerOptions}
                  value={editCustomerId}
                  onChange={setEditCustomerId}
                  placeholder={t('actions.selectCustomer') ?? ''}
                  required
                  clearable
                />
              </FormField>
            )}
            <FormField label={t(isPrintingPress ? 'fields.salesRepresentativePress' : 'fields.salesRepresentative')}>
              <SearchableSelect
                options={isAdmin ? repOptions : lockedRepOptions}
                value={effectiveEditSalesRepId}
                onChange={setEditSalesRepresentativeId}
                placeholder={t(isPrintingPress ? 'actions.selectSalesRepPress' : 'actions.selectSalesRep') ?? ''}
                disabled={!isAdmin}
                clearable={isAdmin}
              />
            </FormField>
            <FormField label={t('common.date')}>
              <Input type="date" required value={editQuotationDate} onChange={(e) => setEditQuotationDate(e.target.value)} />
            </FormField>
          </div>

          <SalesLineEditor lines={editLines} onChange={setEditLines} layout="table" />

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="card flex items-center justify-between gap-4 px-4 py-3 sm:w-64">
              <span className="text-sm font-medium text-[var(--text-muted)]">{t('common.total')}</span>
              <span className="text-2xl font-bold text-[var(--text)]">{formatAmount(computeGrandTotal(editLines))}</span>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditingQuotationId(null)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
