import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable, Column } from '../../components/ui/DataTable';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';

interface SupplierOption {
  id: string;
  companyName: string;
}

interface PurchaseReceiptOption {
  id: string;
  documentNumber: string;
  receiptDate: string;
  supplierId: string;
}

interface AcTaxPayment {
  id: string;
  taxDate: string;
  amount: number;
  notes?: string | null;
  supplierId: string;
  purchaseReceiptId?: string | null;
  createdByName: string;
}

function money(n: number): string {
  return formatAmount(n);
}

/**
 * Air Conditioning only — centralized "الضرائب" tab under the top-level الموردون section (see
 * SuppliersPage.tsx), replacing the per-supplier "ضريبة المبيعات" tab that used to live on each
 * supplier's own detail page (AcSupplierDetailPage.tsx no longer has one, by explicit request).
 * Reads/writes the exact same ac_supplier_tax_payments ledger/endpoint that page used, just
 * unscoped to one supplierId — this is now the ONE place every supplier's tax entries are recorded
 * and browsed. ExpensesPage.tsx's own "الضرائب" tab already reads this same company-wide endpoint
 * for its grand-total figure, so the two can never disagree — recording an entry here is the only
 * way that total moves.
 */
export function SupplierTaxesTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);

  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState('0');
  const [taxDate, setTaxDate] = useState(localToday());
  const [receiptId, setReceiptId] = useState('');
  const [notes, setNotes] = useState('');

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<SupplierOption[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: !!companyId,
  });
  const supplierNameById = useMemo(
    () => new Map((suppliersQuery.data ?? []).map((s) => [s.id, s.companyName])),
    [suppliersQuery.data],
  );
  const supplierOptions = useMemo(
    () => (suppliersQuery.data ?? []).map((s) => ({ value: s.id, label: s.companyName })),
    [suppliersQuery.data],
  );

  // Only needed for the add form's optional "الفاتورة" picker — fetched once the modal is open,
  // same convention as the per-supplier page this replaces.
  const receiptsQuery = useQuery({
    queryKey: ['purchase-receipts', companyId],
    queryFn: () => unwrap<PurchaseReceiptOption[]>(apiClient.get('/inventory/purchase-receipts', { params: { companyId } })),
    enabled: !!companyId && open,
  });
  // Narrowed to the chosen supplier — a receipt from a different supplier would never be a valid
  // reference for this tax entry.
  const receiptOptionsForSupplier = useMemo(
    () => (receiptsQuery.data ?? []).filter((r) => r.supplierId === supplierId),
    [receiptsQuery.data, supplierId],
  );

  const taxQuery = useQuery({
    queryKey: ['ac-supplier-tax-payments', companyId],
    queryFn: () => unwrap<AcTaxPayment[]>(apiClient.get('/ac-supplier-tax-payments', { params: { companyId } })),
    enabled: !!companyId,
  });
  const filteredTax = useMemo(
    () => (taxQuery.data ?? []).filter((r) => inDateRange(r.taxDate, dateRange)),
    [taxQuery.data, dateRange],
  );
  const totalTax = filteredTax.reduce((sum, r) => sum + Number(r.amount), 0);

  function invalidateTax() {
    queryClient.invalidateQueries({ queryKey: ['ac-supplier-tax-payments', companyId] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/ac-supplier-tax-payments', {
        supplierId,
        taxDate,
        amount: Number(amount),
        purchaseReceiptId: receiptId || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      invalidateTax();
      setOpen(false);
      setSupplierId('');
      setAmount('0');
      setTaxDate(localToday());
      setReceiptId('');
      setNotes('');
      toast.success(t('suppliers.taxSavedSuccess'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/ac-supplier-tax-payments/${id}`),
    onSuccess: () => {
      invalidateTax();
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  async function handleDelete(r: AcTaxPayment) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: money(Number(r.amount)) }) });
    if (ok) deleteMutation.mutate(r.id);
  }

  const columns: Column<AcTaxPayment>[] = [
    { header: t('common.date'), accessor: (r) => r.taxDate },
    { header: t('fields.supplier'), accessor: (r) => supplierNameById.get(r.supplierId) ?? '—' },
    { header: t('fields.amount'), accessor: (r) => money(Number(r.amount)), align: 'right' },
    {
      header: t('fields.invoiceOptional'),
      accessor: (r) => (receiptsQuery.data ?? []).find((rec) => rec.id === r.purchaseReceiptId)?.documentNumber ?? '—',
    },
    { header: t('table.description'), accessor: (r) => r.notes ?? '—' },
    { header: t('suppliers.createdBy'), accessor: (r) => r.createdByName },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <button
          type="button"
          className="text-red-600 hover:underline"
          disabled={deleteMutation.isPending}
          onClick={() => handleDelete(r)}
        >
          {t('common.delete')}
        </button>
      ),
      align: 'center',
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-[var(--table-header-bg)] px-3 py-1.5 text-sm font-medium">
            {t('suppliers.totalTaxForPeriod')}: <span className="font-semibold">{money(totalTax)}</span>
          </div>
          <Button onClick={() => setOpen(true)}>+ {t('actions.recordTax')}</Button>
        </div>
      </div>

      <DataTable columns={columns} data={filteredTax} keyField={(r) => r.id} isLoading={taxQuery.isLoading} />

      <Modal open={open} onClose={() => setOpen(false)} title={t('actions.recordTax')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('fields.supplier')}>
              <SearchableSelect
                options={supplierOptions}
                value={supplierId}
                onChange={(v) => {
                  setSupplierId(v);
                  setReceiptId('');
                }}
                placeholder={t('actions.selectSupplier') ?? ''}
                required
              />
            </FormField>
          </div>
          <FormField label={t('common.date')}>
            <Input type="date" required value={taxDate} onChange={(e) => setTaxDate(e.target.value)} />
          </FormField>
          <FormField label={t('fields.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('fields.invoiceOptional')}>
              <Select value={receiptId} onChange={(e) => setReceiptId(e.target.value)} disabled={!supplierId}>
                <option value="">{t('suppliers.noSpecificInvoice')}</option>
                {receiptOptionsForSupplier.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.documentNumber} — {r.receiptDate}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </FormField>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !supplierId}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
