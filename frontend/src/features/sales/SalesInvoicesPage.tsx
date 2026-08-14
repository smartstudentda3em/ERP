import { MouseEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge, statusColor } from '../../components/ui/Badge';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { localToday } from '../../lib/date-utils';
import { SalesLineEditor, SalesLineForm, emptyLine, linesToPayload, computeGrandTotal } from './SalesLineEditor';
import { useSalesRepLock } from './useSalesRepLock';
import { useActiveCompany, useIsSalesRep } from '../../lib/use-active-company';

interface SalesInvoice {
  id: string;
  documentNumber: string;
  invoiceDate: string;
  status: string;
  grandTotal: number;
  amountPaid: number;
  customerId: string;
  customer: { name: string };
  customerName: string | null;
  customerPhone: string | null;
  paymentAccount: 'CASH' | 'BANK' | null;
  salesRepresentativeId: string | null;
  branchId: string | null;
  branch: { nameAr?: string | null; nameEn?: string | null } | null;
  createdById: string;
  createdByName: string;
  notes: string | null;
}
interface Customer {
  id: string;
  name: string;
  code?: string;
}
interface Warehouse {
  id: string;
  nameEn: string;
  branchId?: string | null;
}
interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}
interface SalesRepresentative {
  id: string;
  name: string;
  userId?: string | null;
  branchId?: string | null;
}
interface UserOption {
  id: string;
  fullName: string;
}

export function SalesInvoicesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const companyId = currentUser?.companyId;
  // "مدير فرع" holds sales.invoice.view/create but never .edit/.delete (see run-seed.ts's
  // BRANCH_MANAGER_PRESS_PERMISSION_CODES) — the server already 403s those calls, this just keeps
  // the buttons from ever appearing for a role that can't use them, instead of failing on click.
  const canEditInvoice = useAuthStore((s) => s.hasPermission('sales.invoice.edit'));
  const canDeleteInvoice = useAuthStore((s) => s.hasPermission('sales.invoice.delete'));
  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [salesRepresentativeId, setSalesRepresentativeId] = useState('');
  const [createdById, setCreatedById] = useState(currentUser?.id ?? '');
  const [invoiceDate, setInvoiceDate] = useState(localToday());
  const [lines, setLines] = useState<SalesLineForm[]>([emptyLine()]);
  const [paidAmount, setPaidAmount] = useState('0');
  // Printing Press only — every other company's upfront payment always settles into CASH (see
  // sales-invoices.service.ts, which defaults to CASH when this is omitted).
  const [paymentAccount, setPaymentAccount] = useState<'CASH' | 'BANK'>('CASH');
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  const confirm = useConfirm();

  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editSalesRepresentativeId, setEditSalesRepresentativeId] = useState('');
  const [editCreatedById, setEditCreatedById] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const grandTotal = computeGrandTotal(lines);
  const paidAmountNumber = Number(paidAmount || 0);
  const remainingAmount = grandTotal - paidAmountNumber;
  const paymentStatusKey =
    paidAmountNumber <= 0 ? 'UNPAID' : paidAmountNumber >= grandTotal ? 'PAID' : 'PARTIALLY_PAID';
  const paymentStatusColor =
    paymentStatusKey === 'PAID' ? 'green' : paymentStatusKey === 'PARTIALLY_PAID' ? 'yellow' : 'gray';

  const invoicesQuery = useQuery({
    queryKey: ['sales-invoices', companyId],
    queryFn: () => unwrap<SalesInvoice[]>(apiClient.get('/sales/invoices', { params: { companyId } })),
    enabled: !!companyId,
  });

  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: (modalOpen || !!editingInvoiceId) && !!companyId,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', companyId],
    queryFn: () => unwrap<Warehouse[]>(apiClient.get('/settings/warehouses', { params: { companyId } })),
    enabled: modalOpen && !!companyId,
  });

  const salesRepsQuery = useQuery({
    queryKey: ['sales-representatives'],
    queryFn: () => unwrap<SalesRepresentative[]>(apiClient.get('/sales-representatives')),
    enabled: modalOpen || !!editingInvoiceId,
  });

  const assignableUsersQuery = useQuery({
    queryKey: ['sales-invoices-assignable-users'],
    queryFn: () => unwrap<UserOption[]>(apiClient.get('/sales/invoices/assignable-users')),
    enabled: modalOpen || !!editingInvoiceId,
  });

  const { isAdmin: isSystemAdmin, ownRep, currentUserId, currentUserName } = useSalesRepLock(salesRepsQuery.data);
  const lockedAssigneeLabel = ownRep?.name ?? currentUserName;

  // Printing Press has no Customers screen at all (confirmed scope: every other company is
  // unaffected) — every sale there is silently attributed to the one seeded walk-in customer
  // instead of showing a picker, since there's nowhere to manage real customer records for it.
  // Queries /auth/my-companies (via useActiveCompany) rather than the settings.company.view-gated
  // /settings/companies — a role like "مدير فرع" or "مندوب" has neither that permission nor any
  // reason to, so the gated endpoint 403'd silently and left isPrintingPress always false for them.
  const { company: currentCompany, isPrintingPress, isStationery } = useActiveCompany();
  // Stationery-only governance: even a true Administrator is locked to their own identity here —
  // no free rep/user picker — so the "المندوب أو المسؤول" field always shows exactly whoever is
  // logged in, matching Manager/مندوب's existing lock below. AC and Press keep the Administrator's
  // free assignment exactly as before (confirmed scope: no effect on other companies).
  const isAdmin = isSystemAdmin && !isStationery;
  // Stationery and Air Conditioning must also pick a بنك/كاش deposit account on every invoice
  // (see SalesInvoicesService.create()'s assertPaymentAccountProvided) — unlike Press they keep
  // the normal customer/warehouse form, this just adds the required selector alongside it.
  // A "مندوب" never picks an account at all, in any company — their sale is auto-routed into
  // their own خزينة المندوب pocket server-side (see SalesInvoicesService.isSalesAgentRep).
  const isSalesRep = useIsSalesRep();
  const requiresPaymentAccount =
    !isSalesRep && (isPrintingPress || currentCompany?.code === 'STAT' || currentCompany?.code === 'AC');
  const walkInCustomer = customersQuery.data?.find((c) => c.code === 'WALKIN');

  // Printing Press only — the invoice form shows a Branch field instead of Warehouse; the linked
  // warehouse (Warehouse.branchId) is then resolved automatically, same pattern as PurchasingPage
  // and StockAuditPage.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && modalOpen && !!companyId,
  });

  const resolvedWarehouseId = useMemo(() => {
    if (!isPrintingPress) return warehouseId;
    if (!branchId) return '';
    return (warehousesQuery.data ?? []).find((w) => w.branchId === branchId)?.id ?? '';
  }, [isPrintingPress, branchId, warehouseId, warehousesQuery.data]);

  useEffect(() => {
    if (isPrintingPress && walkInCustomer && !customerId) setCustomerId(walkInCustomer.id);
  }, [isPrintingPress, walkInCustomer, customerId]);

  useEffect(() => {
    if (isPrintingPress && walkInCustomer && editingInvoiceId && !editCustomerId) setEditCustomerId(walkInCustomer.id);
  }, [isPrintingPress, walkInCustomer, editingInvoiceId, editCustomerId]);

  // One combined dropdown covers both business entities: a sales representative (commission
  // tracking) or a system user (who actually created/owns the invoice) — encoded as "rep:<id>" /
  // "user:<id>" since they're two different foreign keys under the hood. Non-admins never see
  // their own choice here — the value is always forced to their own identity (own linked rep if
  // any, else themselves as a user), same as the backend independently re-enforces.
  const assigneeValue = isAdmin
    ? salesRepresentativeId
      ? `rep:${salesRepresentativeId}`
      : createdById
        ? `user:${createdById}`
        : ''
    : ownRep
      ? `rep:${ownRep.id}`
      : `user:${currentUserId}`;

  function handleAssigneeChange(value: string) {
    if (value.startsWith('rep:')) {
      setSalesRepresentativeId(value.slice(4));
      setCreatedById('');
    } else if (value.startsWith('user:')) {
      setSalesRepresentativeId('');
      setCreatedById(value.slice(5));
    } else {
      setSalesRepresentativeId('');
      setCreatedById('');
    }
  }

  const resolvedRepId = (isAdmin ? salesRepresentativeId : ownRep?.id) || undefined;

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/sales/invoices', {
        invoiceDate,
        customerId,
        warehouseId: isPrintingPress ? resolvedWarehouseId : warehouseId,
        companyId,
        salesRepresentativeId: resolvedRepId,
        createdById: (isAdmin ? createdById : currentUserId) || undefined,
        paidAmount: paidAmountNumber,
        paymentAccount: requiresPaymentAccount ? paymentAccount : undefined,
        branchId: isPrintingPress ? branchId || undefined : undefined,
        customerName: isPrintingPress ? customerName || undefined : undefined,
        customerPhone: isPrintingPress ? customerPhone || undefined : undefined,
        lines: linesToPayload(lines),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customer-statement'] });
      queryClient.invalidateQueries({ queryKey: ['customer-outstanding-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent-tx'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-sales-chart'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-top-products'] });
      setModalOpen(false);
      setCustomerId('');
      setWarehouseId('');
      setBranchId('');
      setCustomerName('');
      setCustomerPhone('');
      setSalesRepresentativeId('');
      setCreatedById(currentUser?.id ?? '');
      setLines([emptyLine()]);
      setPaidAmount('0');
      setPaymentAccount('CASH');
      setError(null);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  // Same "rep:<id>" / "user:<id>" merged encoding as the create form's dropdown, kept as separate
  // state since the edit modal is a different, smaller form (see UpdateSalesInvoiceDto — only
  // date/customer/rep-or-owner/notes are ever editable, never the warehouse or line items). Same
  // non-admin lock as the create form: editing an invoice never lets a non-admin hand it to
  // anyone else, even if it was originally assigned to someone else.
  const editAssigneeValue = isAdmin
    ? editSalesRepresentativeId
      ? `rep:${editSalesRepresentativeId}`
      : editCreatedById
        ? `user:${editCreatedById}`
        : ''
    : ownRep
      ? `rep:${ownRep.id}`
      : `user:${currentUserId}`;

  function handleEditAssigneeChange(value: string) {
    if (value.startsWith('rep:')) {
      setEditSalesRepresentativeId(value.slice(4));
      setEditCreatedById('');
    } else if (value.startsWith('user:')) {
      setEditSalesRepresentativeId('');
      setEditCreatedById(value.slice(5));
    } else {
      setEditSalesRepresentativeId('');
      setEditCreatedById('');
    }
  }

  function openEditInvoice(invoice: SalesInvoice) {
    setEditingInvoiceId(invoice.id);
    setEditCustomerId(invoice.customerId);
    setEditCustomerName(invoice.customerName ?? '');
    setEditCustomerPhone(invoice.customerPhone ?? '');
    setEditInvoiceDate(invoice.invoiceDate);
    setEditSalesRepresentativeId(invoice.salesRepresentativeId ?? '');
    setEditCreatedById(invoice.salesRepresentativeId ? '' : invoice.createdById);
    setEditNotes(invoice.notes ?? '');
    setEditError(null);
  }

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/sales/invoices/${editingInvoiceId}`, {
        invoiceDate: editInvoiceDate,
        customerId: editCustomerId,
        salesRepresentativeId: (isAdmin ? editSalesRepresentativeId : ownRep?.id) || undefined,
        createdById: (isAdmin ? editCreatedById : currentUserId) || undefined,
        notes: editNotes || undefined,
        customerName: isPrintingPress ? editCustomerName || undefined : undefined,
        customerPhone: isPrintingPress ? editCustomerPhone || undefined : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customer-statement'] });
      queryClient.invalidateQueries({ queryKey: ['customer-outstanding-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditingInvoiceId(null);
    },
    onError: (err: any) => {
      setEditError(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/sales/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customer-statement'] });
      queryClient.invalidateQueries({ queryKey: ['customer-outstanding-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent-tx'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-sales-chart'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-top-products'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lines-report'] });
    },
  });

  async function handleDeleteInvoice(e: MouseEvent, invoice: SalesInvoice) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: invoice.documentNumber }) });
    if (ok) deleteMutation.mutate(invoice.id);
  }

  const filteredInvoices = useMemo(
    () => (invoicesQuery.data ?? []).filter((i) => inDateRange(i.invoiceDate, dateRange)),
    [invoicesQuery.data, dateRange],
  );

  const columns: Column<SalesInvoice>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.invoiceDate },
    {
      header: isPrintingPress ? t('fields.customerName') : t('nav.customers'),
      accessor: (r) => (isPrintingPress ? r.customerName || r.customer?.name || '—' : r.customer?.name),
    },
    ...(requiresPaymentAccount
      ? [
          {
            header: t('table.paymentMethod'),
            accessor: (r: SalesInvoice) =>
              r.paymentAccount ? t(`treasury.paymentAccounts.${r.paymentAccount}`) : '—',
          } as Column<SalesInvoice>,
        ]
      : []),
    {
      header: t('common.status'),
      accessor: (r) => <Badge color={statusColor(r.status)}>{t(`docStatus.${r.status}`, r.status)}</Badge>,
    },
    { header: t('common.total'), accessor: (r) => formatAmount(r.grandTotal), align: 'right' },
    { header: t('table.paid'), accessor: (r) => formatAmount(r.amountPaid), align: 'right' },
    {
      header: t('fields.remainingAmount'),
      accessor: (r) => formatAmount(Number(r.grandTotal) - Number(r.amountPaid)),
      align: 'right',
    },
    isPrintingPress
      ? { header: t('fields.branch'), accessor: (r: SalesInvoice) => r.branch?.nameAr || r.branch?.nameEn || '—' }
      : { header: t('fields.invoiceOwner'), accessor: (r: SalesInvoice) => r.createdByName ?? '—' },
    ...(canEditInvoice || canDeleteInvoice
      ? [
          {
            header: t('common.actions'),
            accessor: (r: SalesInvoice) => (
              <div className="flex justify-center gap-3">
                {canEditInvoice && (
                  <button
                    type="button"
                    className="text-primary-600 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditInvoice(r);
                    }}
                  >
                    {t('common.edit')}
                  </button>
                )}
                {canDeleteInvoice && (
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    disabled={deleteMutation.isPending}
                    onClick={(e) => handleDeleteInvoice(e, r)}
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            ),
            align: 'center' as const,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.salesInvoices')}
        actions={<Button onClick={() => setModalOpen(true)}>+ {t('common.create')}</Button>}
      />

      <DateRangeFilter value={dateRange} onChange={setDateRange} />
      <DataTable
        columns={columns}
        data={filteredInvoices}
        keyField={(r) => r.id}
        isLoading={invoicesQuery.isLoading}
        onRowClick={(r) => navigate(`/sales/invoices/${r.id}`)}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('common.create')}
        widthClass="max-w-5xl"
      >
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          {isPrintingPress ? (
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>{t('fields.invoiceBasicInfo')}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-3">
                <FormField label={t('fields.customerName')}>
                  <Input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                </FormField>
                <FormField label={t('fields.phone')}>
                  <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
                </FormField>
                <FormField label={t('fields.branch')}>
                  <Select required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                    <option value="">{t('actions.selectBranch')}</option>
                    {(branchesQuery.data ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameAr || b.nameEn}
                      </option>
                    ))}
                  </Select>
                  {branchId && !resolvedWarehouseId && (
                    <p className="mt-1 text-xs text-red-600">{t('stockAudit.noWarehouseForBranch')}</p>
                  )}
                </FormField>
                <FormField label={t('common.date')}>
                  <Input type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </FormField>
                <FormField label={t('fields.invoiceOwnerPress')}>
                  <Select value={assigneeValue} disabled={!isAdmin} onChange={(e) => handleAssigneeChange(e.target.value)}>
                    {isAdmin ? (
                      <>
                        <option value="">{t('actions.selectSalesRepPress')}</option>
                        {(salesRepsQuery.data ?? []).map((r) => (
                          <option key={r.id} value={`rep:${r.id}`}>
                            {r.name}
                          </option>
                        ))}
                        {(assignableUsersQuery.data ?? []).map((u) => (
                          <option key={u.id} value={`user:${u.id}`}>
                            {u.fullName}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value={assigneeValue}>{lockedAssigneeLabel}</option>
                    )}
                  </Select>
                </FormField>
                {requiresPaymentAccount && (
                  <FormField label={t('fields.depositDestination')}>
                    <Select
                      required
                      value={paymentAccount}
                      onChange={(e) => setPaymentAccount(e.target.value as 'CASH' | 'BANK')}
                    >
                      <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                      <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
                    </Select>
                  </FormField>
                )}
              </div>
            </Card>
          ) : (
            <>
              <div className="col-span-2 grid grid-cols-2 gap-3">
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
                <FormField label={t('fields.warehouse')}>
                  <Select required value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                    <option value="">{t('actions.selectWarehouse')}</option>
                    {(warehousesQuery.data ?? []).map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.nameEn}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label={t('common.date')}>
                  <Input type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </FormField>
                <FormField label={t('fields.invoiceOwner')}>
                  <Select value={assigneeValue} disabled={!isAdmin} onChange={(e) => handleAssigneeChange(e.target.value)}>
                    {isAdmin ? (
                      <>
                        <option value="">{t('actions.selectSalesRep')}</option>
                        {(salesRepsQuery.data ?? []).map((r) => (
                          <option key={r.id} value={`rep:${r.id}`}>
                            {r.name}
                          </option>
                        ))}
                        {(assignableUsersQuery.data ?? []).map((u) => (
                          <option key={u.id} value={`user:${u.id}`}>
                            {u.fullName}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value={assigneeValue}>{lockedAssigneeLabel}</option>
                    )}
                  </Select>
                </FormField>
                {requiresPaymentAccount && (
                  <FormField label={t('fields.depositDestination')}>
                    <Select
                      required
                      value={paymentAccount}
                      onChange={(e) => setPaymentAccount(e.target.value as 'CASH' | 'BANK')}
                    >
                      <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                      <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
                    </Select>
                  </FormField>
                )}
              </div>
            </>
          )}

          <SalesLineEditor
            lines={lines}
            onChange={setLines}
            warnOnSellBelowCost={currentCompany?.warnOnSellBelowCost ?? true}
            layout={isPrintingPress ? 'grid' : 'table'}
          />

          {isPrintingPress ? (
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>{t('fields.invoiceSummary')}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <FormField label={t('common.total')}>
                  <Input disabled value={formatAmount(grandTotal)} />
                </FormField>
                <FormField label={t('fields.paidAmount')}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                </FormField>
                <FormField label={t('fields.remainingAmount')}>
                  <Input disabled value={formatAmount(remainingAmount)} />
                </FormField>
                <div className="sm:col-span-3">
                  <Badge color={paymentStatusColor}>{t(`docStatus.${paymentStatusKey}`)}</Badge>
                </div>
              </div>
            </Card>
          ) : (
            <div className="col-span-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('common.total')}</div>
                <div className="mt-1 text-lg font-semibold">{formatAmount(grandTotal)}</div>
              </Card>
              <Card>
                <FormField label={t('fields.paidAmount')}>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                  />
                </FormField>
              </Card>
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('fields.remainingAmount')}</div>
                <div className="mt-1 text-lg font-semibold">{formatAmount(remainingAmount)}</div>
              </Card>
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('common.status')}</div>
                <div className="mt-1.5">
                  <Badge color={paymentStatusColor}>{t(`docStatus.${paymentStatusKey}`)}</Badge>
                </div>
              </Card>
            </div>
          )}

          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || (isPrintingPress && !resolvedWarehouseId)}
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editingInvoiceId} onClose={() => setEditingInvoiceId(null)} title={t('common.edit')}>
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
          {isPrintingPress && (
            <>
              <FormField label={t('fields.customerName')}>
                <Input required value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} />
              </FormField>
              <FormField label={t('fields.phone')}>
                <Input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} />
              </FormField>
            </>
          )}
          <FormField label={t('common.date')}>
            <Input type="date" required value={editInvoiceDate} onChange={(e) => setEditInvoiceDate(e.target.value)} />
          </FormField>
          <div className="col-span-2">
            <FormField label={t(isPrintingPress ? 'fields.invoiceOwnerPress' : 'fields.invoiceOwner')}>
              <Select
                value={editAssigneeValue}
                disabled={!isAdmin}
                onChange={(e) => handleEditAssigneeChange(e.target.value)}
              >
                {isAdmin ? (
                  <>
                    <option value="">{t(isPrintingPress ? 'actions.selectSalesRepPress' : 'actions.selectSalesRep')}</option>
                    {(salesRepsQuery.data ?? []).map((r) => (
                      <option key={r.id} value={`rep:${r.id}`}>
                        {r.name}
                      </option>
                    ))}
                    {(assignableUsersQuery.data ?? []).map((u) => (
                      <option key={u.id} value={`user:${u.id}`}>
                        {u.fullName}
                      </option>
                    ))}
                  </>
                ) : (
                  <option value={editAssigneeValue}>{lockedAssigneeLabel}</option>
                )}
              </Select>
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </FormField>
          </div>

          {editError && <p className="col-span-2 text-sm text-red-600">{editError}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingInvoiceId(null)}>
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
