import { MouseEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount, roundTo } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge, statusColor } from '../../components/ui/Badge';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';
import { SalesLineEditor, SalesLineForm, emptyLine, linesToPayload } from './SalesLineEditor';
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
      accessor: (r) => {
        // Once a quotation is past DRAFT, only a true Administrator may still edit/delete it —
        // mirrors QuotationsService.assertMayModify(), the actual server-side enforcement.
        const canModify = FREELY_EDITABLE_STATUSES.includes(r.status) || isSystemRole;
        const canConvert = !NON_CONVERTIBLE_STATUSES.includes(r.status);
        return (
          <div className="flex justify-center gap-3">
            {canModify && (
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
            {canModify && (
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
            <button
              type="button"
              className="text-primary-600 hover:underline"
              title={t('actions.downloadPdf')}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/sales/quotations/${r.id}?autopdf=1`);
              }}
            >
              📥 {t('actions.downloadPdf')}
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('common.create')} widthClass="max-w-3xl">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          {!isPrintingPress && (
            <FormField label={t('nav.customers')}>
              <Select required value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">{t('actions.selectCustomer')}</option>
                {(customersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label={t('common.date')}>
            <Input type="date" required value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} />
          </FormField>
          <FormField label={t(isPrintingPress ? 'fields.salesRepresentativePress' : 'fields.salesRepresentative')}>
            <Select
              value={effectiveSalesRepId}
              disabled={!isAdmin}
              onChange={(e) => setSalesRepresentativeId(e.target.value)}
            >
              {isAdmin ? (
                <>
                  <option value="">{t(isPrintingPress ? 'actions.selectSalesRepPress' : 'actions.selectSalesRep')}</option>
                  {(salesRepsQuery.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </>
              ) : (
                <option value={ownRep?.id ?? ''}>{ownRep?.name ?? currentUserName}</option>
              )}
            </Select>
          </FormField>

          <SalesLineEditor lines={lines} onChange={setLines} />

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingQuotationId} onClose={() => setEditingQuotationId(null)} title={t('common.edit')} widthClass="max-w-3xl">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            updateMutation.mutate();
          }}
        >
          {!isPrintingPress && (
            <FormField label={t('nav.customers')}>
              <Select required value={editCustomerId} onChange={(e) => setEditCustomerId(e.target.value)}>
                <option value="">{t('actions.selectCustomer')}</option>
                {(customersQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label={t('common.date')}>
            <Input type="date" required value={editQuotationDate} onChange={(e) => setEditQuotationDate(e.target.value)} />
          </FormField>
          <FormField label={t(isPrintingPress ? 'fields.salesRepresentativePress' : 'fields.salesRepresentative')}>
            <Select
              value={effectiveEditSalesRepId}
              disabled={!isAdmin}
              onChange={(e) => setEditSalesRepresentativeId(e.target.value)}
            >
              {isAdmin ? (
                <>
                  <option value="">{t(isPrintingPress ? 'actions.selectSalesRepPress' : 'actions.selectSalesRep')}</option>
                  {(salesRepsQuery.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </>
              ) : (
                <option value={ownRep?.id ?? ''}>{ownRep?.name ?? currentUserName}</option>
              )}
            </Select>
          </FormField>

          <SalesLineEditor lines={editLines} onChange={setEditLines} />

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingQuotationId(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
