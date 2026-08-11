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
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';

type PaymentType = 'DEPOSIT' | 'PARTIAL' | 'FINAL_SETTLEMENT' | 'SHIPPING_COST';
type PaymentAccount = 'CASH' | 'BANK';

interface ShipmentOption {
  id: string;
  shipmentName: string;
}

interface ShipmentPayment {
  id: string;
  paymentDate: string;
  shipmentId: string;
  shipment: ShipmentOption | null;
  paymentType: PaymentType;
  amount: number;
  account: PaymentAccount;
  notes: string | null;
}

const emptyForm = {
  paymentDate: localToday(),
  shipmentId: '',
  paymentType: 'DEPOSIT' as PaymentType,
  amount: '',
  account: 'CASH' as PaymentAccount,
  notes: '',
};

function money(n: number): string {
  return formatAmount(n);
}

export function ShipmentPaymentsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  // Opened by clicking any payment row — shows the per-type breakdown and full payment history
  // for that row's shipment (every payment recorded against it, not just the one clicked).
  const [detailsShipmentId, setDetailsShipmentId] = useState<string | null>(null);
  // Rolled ourselves (searchable={false} on the main DataTable below) instead of DataTable's own
  // built-in search box — that box filters its rendered rows internally with no way for this
  // component to see the result, which is exactly what would keep "إجمالي الدفعات المدفوعة" stuck
  // on the grand total instead of tracking the filtered subset.
  const [search, setSearch] = useState('');

  const paymentsQuery = useQuery({
    queryKey: ['shipment-payments', companyId],
    queryFn: () => unwrap<ShipmentPayment[]>(apiClient.get('/imports/shipment-payments', { params: { companyId } })),
    enabled: !!companyId,
  });

  const shipmentsQuery = useQuery({
    queryKey: ['shipments', companyId],
    queryFn: () => unwrap<ShipmentOption[]>(apiClient.get('/imports/shipments', { params: { companyId } })),
    enabled: !!companyId,
  });

  // Filters on اسم الشحنة and نوع الدفعة (matched against its translated label, e.g. typing "شحن"
  // matches the "تكلفة شحن" option) — same substring/case-insensitive matching DataTable's own
  // built-in search would have done, just lifted up here so the total badge below can track it.
  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return paymentsQuery.data ?? [];
    return (paymentsQuery.data ?? []).filter(
      (p) =>
        (p.shipment?.shipmentName ?? '').toLowerCase().includes(q) ||
        t(`imports.paymentTypes.${p.paymentType}`).toLowerCase().includes(q),
    );
  }, [paymentsQuery.data, search, t]);

  // إجمالي الدفعات المدفوعة: live sum over the currently FILTERED rows only, so typing/clearing a
  // character in the search box recomputes this immediately to match what's actually shown below —
  // never the unfiltered grand total once a search term is active.
  const totalPaid = useMemo(
    () => filteredPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    [filteredPayments],
  );

  // Every payment recorded against the shipment currently open in the details modal, oldest last
  // (matches the main table's own newest-first ordering) — recomputes automatically from the same
  // paymentsQuery data the main table uses, so it's never a separate fetch to keep in sync.
  const detailsPayments = useMemo(
    () => (paymentsQuery.data ?? []).filter((p) => p.shipmentId === detailsShipmentId),
    [paymentsQuery.data, detailsShipmentId],
  );

  // إجمالي ما تم دفعه لكل نوع، على شحنة واحدة — عربون وتكلفة الشحن كل منهما رقم مستقل، بينما
  // الدفعات تحت الحساب والتسوية النهائية تُجمعان في رقم واحد (نفس طبيعة "سداد جزئي من قيمة الشحنة").
  const detailsBreakdown = useMemo(() => {
    let deposit = 0;
    let shippingCost = 0;
    let partialOrSettlement = 0;
    for (const p of detailsPayments) {
      const amount = Number(p.amount ?? 0);
      if (p.paymentType === 'DEPOSIT') deposit += amount;
      else if (p.paymentType === 'SHIPPING_COST') shippingCost += amount;
      else partialOrSettlement += amount;
    }
    return { deposit, shippingCost, partialOrSettlement };
  }, [detailsPayments]);

  const detailsShipmentName = detailsPayments[0]?.shipment?.shipmentName ?? '';

  const isValid = !!form.paymentDate && !!form.shipmentId && !!form.paymentType && !!form.amount && !!form.account;

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        paymentDate: form.paymentDate,
        shipmentId: form.shipmentId,
        paymentType: form.paymentType,
        amount: Number(form.amount),
        account: form.account,
        notes: form.notes || undefined,
      };
      return editingId
        ? apiClient.patch(`/imports/shipment-payments/${editingId}`, payload)
        : apiClient.post('/imports/shipment-payments', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-payments'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/imports/shipment-payments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shipment-payments'] }),
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('common.saveFailed'));
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(row: ShipmentPayment) {
    setEditingId(row.id);
    setForm({
      paymentDate: row.paymentDate,
      shipmentId: row.shipmentId,
      paymentType: row.paymentType,
      amount: String(row.amount),
      account: row.account,
      notes: row.notes ?? '',
    });
    setModalOpen(true);
  }

  async function handleDelete(e: MouseEvent, row: ShipmentPayment) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.shipment?.shipmentName ?? '' }) });
    if (ok) deleteMutation.mutate(row.id);
  }

  const columns: Column<ShipmentPayment>[] = [
    { header: t('imports.paymentDate'), accessor: (r) => r.paymentDate },
    { header: t('imports.shipmentName'), accessor: (r) => r.shipment?.shipmentName ?? '—' },
    { header: t('imports.paymentType'), accessor: (r) => t(`imports.paymentTypes.${r.paymentType}`) },
    { header: t('treasury.paymentAccount'), accessor: (r) => t(`treasury.paymentAccounts.${r.account}`) },
    { header: t('imports.amountPaid'), accessor: (r) => money(Number(r.amount ?? 0)), align: 'right' },
    { header: t('common.notes'), accessor: (r) => r.notes ?? '—' },
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
      <div className="mb-3 grid grid-cols-3 items-center gap-3">
        <Input
          type="search"
          placeholder={t('common.search') ?? ''}
          className="max-w-xs justify-self-start"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2 justify-self-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm">
          <span className="text-[var(--text-muted)]">{t('imports.totalShipmentPayments')}</span>
          <span className="font-semibold">{money(totalPaid)}</span>
        </div>
        <Button className="justify-self-end" onClick={openCreate}>
          + {t('imports.addShipmentPayment')}
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={filteredPayments}
        keyField={(r) => r.id}
        isLoading={paymentsQuery.isLoading}
        searchable={false}
        onRowClick={(r) => setDetailsShipmentId(r.shipmentId)}
      />

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingId(null);
        }}
        title={editingId ? t('common.edit') : t('imports.addShipmentPayment')}
      >
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <FormField label={t('imports.paymentDate')} required>
            <Input
              type="date"
              required
              value={form.paymentDate}
              onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
            />
          </FormField>
          <FormField label={t('imports.shipmentName')} required>
            <Select
              required
              value={form.shipmentId}
              onChange={(e) => setForm({ ...form, shipmentId: e.target.value })}
            >
              <option value="">{t('imports.selectShipment')}</option>
              {(shipmentsQuery.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.shipmentName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('imports.paymentType')} required>
            <Select
              required
              value={form.paymentType}
              onChange={(e) => setForm({ ...form, paymentType: e.target.value as PaymentType })}
            >
              <option value="DEPOSIT">{t('imports.paymentTypes.DEPOSIT')}</option>
              <option value="PARTIAL">{t('imports.paymentTypes.PARTIAL')}</option>
              <option value="FINAL_SETTLEMENT">{t('imports.paymentTypes.FINAL_SETTLEMENT')}</option>
              <option value="SHIPPING_COST">{t('imports.paymentTypes.SHIPPING_COST')}</option>
            </Select>
          </FormField>
          <FormField label={t('imports.amountPaid')} required>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('treasury.paymentAccount')} required>
              <Select
                required
                value={form.account}
                onChange={(e) => setForm({ ...form, account: e.target.value as PaymentAccount })}
              >
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
              </Select>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t('imports.paymentMemoHint')}</p>
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('common.notes')}>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={saveMutation.isPending || !isValid}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!detailsShipmentId}
        onClose={() => setDetailsShipmentId(null)}
        title={t('imports.paymentDetailsTitle', { shipment: detailsShipmentName })}
      >
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <div className="text-[var(--text-muted)]">{t('imports.totalDeposit')}</div>
            <div className="mt-1 text-lg font-semibold">{money(detailsBreakdown.deposit)}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <div className="text-[var(--text-muted)]">{t('imports.totalShippingCostPaid')}</div>
            <div className="mt-1 text-lg font-semibold">{money(detailsBreakdown.shippingCost)}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
            <div className="text-[var(--text-muted)]">{t('imports.totalPartialOrSettlement')}</div>
            <div className="mt-1 text-lg font-semibold">{money(detailsBreakdown.partialOrSettlement)}</div>
          </div>
        </div>

        <DataTable
          columns={[
            { header: t('imports.paymentDate'), accessor: (r: ShipmentPayment) => r.paymentDate },
            { header: t('imports.paymentType'), accessor: (r: ShipmentPayment) => t(`imports.paymentTypes.${r.paymentType}`) },
            {
              header: t('treasury.paymentAccount'),
              accessor: (r: ShipmentPayment) => t(`treasury.paymentAccounts.${r.account}`),
            },
            {
              header: t('imports.amountPaid'),
              accessor: (r: ShipmentPayment) => money(Number(r.amount ?? 0)),
              align: 'right' as const,
            },
          ]}
          data={detailsPayments}
          keyField={(r) => r.id}
          searchable={false}
        />
      </Modal>
    </div>
  );
}
