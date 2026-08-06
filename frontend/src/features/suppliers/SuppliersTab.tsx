import { MouseEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';

interface Currency {
  id: string;
  code: string;
  nameEn: string;
  symbol?: string | null;
}

/** Suppliers/Import screens show currency as its short symbol (falling back to the ISO code when
 * no symbol is set) instead of the long "code — name" form used elsewhere in the system. */
function currencyLabel(c: Currency | null | undefined): string {
  if (!c) return '—';
  return c.symbol || c.code;
}

interface Supplier {
  id: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  currencyId: string | null;
  currency: Currency | null;
  openingBalance: number;
}

interface PurchaseReceipt {
  supplierId: string;
  totalAmount: number;
  paidAmount: number;
}

const emptyForm = { companyName: '', contactPerson: '', phone: '', currencyId: '' };

export function SuppliersTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isPrintingPress } = useActiveCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const canCreate = useAuthStore((s) => s.hasPermission('suppliers.create'));
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<Supplier[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: !!companyId,
  });

  // Only needed for the three financial columns below (Printing Press only), so this query is
  // skipped entirely for every other company.
  const receiptsQuery = useQuery({
    queryKey: ['purchase-receipts', companyId],
    queryFn: () => unwrap<PurchaseReceipt[]>(apiClient.get('/inventory/purchase-receipts', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  const supplierTotals = useMemo(() => {
    const map = new Map<string, { totalPurchases: number; amountPaid: number }>();
    for (const r of receiptsQuery.data ?? []) {
      const entry = map.get(r.supplierId) ?? { totalPurchases: 0, amountPaid: 0 };
      entry.totalPurchases += Number(r.totalAmount ?? 0);
      entry.amountPaid += Number(r.paidAmount ?? 0);
      map.set(r.supplierId, entry);
    }
    return map;
  }, [receiptsQuery.data]);

  const currenciesQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: () => unwrap<Currency[]>(apiClient.get('/settings/currencies')),
    enabled: modalOpen,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        companyId,
        companyName: form.companyName,
        contactPerson: form.contactPerson || undefined,
        phone: form.phone || undefined,
        currencyId: form.currencyId || undefined,
      };
      return editingId ? apiClient.patch(`/suppliers/${editingId}`, payload) : apiClient.post('/suppliers', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/suppliers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      companyName: supplier.companyName,
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      currencyId: supplier.currencyId ?? '',
    });
    setModalOpen(true);
  }

  async function handleDelete(e: MouseEvent, supplier: Supplier) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: supplier.companyName }) });
    if (ok) deleteMutation.mutate(supplier.id);
  }

  const columns: Column<Supplier>[] = [
    { header: t('common.name'), accessor: (r) => r.companyName },
    { header: t('fields.contactPerson'), accessor: (r) => r.contactPerson ?? '—' },
    { header: t('fields.phone'), accessor: (r) => r.phone ?? '—' },
    { header: t('fields.currency'), accessor: (r) => currencyLabel(r.currency) },
    // Printing Press only. Both figures open SupplierStatementPage: "إجمالي المشتريات" shows the
    // full statement, "المتبقي كمستحق للمورد" shows the same page narrowed to unpaid/partially
    // paid receipts via ?scope=pending.
    ...(isPrintingPress
      ? [
          {
            header: t('fields.totalPurchases'),
            accessor: (r: Supplier) => {
              const totals = supplierTotals.get(r.id) ?? { totalPurchases: 0, amountPaid: 0 };
              return (
                <button
                  type="button"
                  className="text-primary-600 underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/suppliers/${r.id}/statement`);
                  }}
                >
                  {formatAmount(totals.totalPurchases)}
                </button>
              );
            },
            align: 'right' as const,
          },
          {
            header: t('fields.paidAmount'),
            accessor: (r: Supplier) => formatAmount((supplierTotals.get(r.id) ?? { amountPaid: 0 }).amountPaid),
            align: 'right' as const,
          },
          {
            header: t('purchasing.outstandingToSupplier'),
            accessor: (r: Supplier) => {
              const totals = supplierTotals.get(r.id) ?? { totalPurchases: 0, amountPaid: 0 };
              const outstanding = totals.totalPurchases - totals.amountPaid;
              return (
                <button
                  type="button"
                  className="text-primary-600 underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/suppliers/${r.id}/statement?scope=pending`);
                  }}
                >
                  {formatAmount(outstanding)}
                </button>
              );
            },
            align: 'right' as const,
          },
        ]
      : []),
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

      <DataTable
        columns={columns}
        data={suppliersQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={suppliersQuery.isLoading}
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
          <FormField label={t('fields.companyName')}>
            <Input
              required
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.contactPerson')}>
            <Input
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.phone')}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <FormField label={t('fields.currency')}>
            <Select value={form.currencyId} onChange={(e) => setForm({ ...form, currencyId: e.target.value })}>
              <option value="">—</option>
              {(currenciesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {currencyLabel(c)}
                </option>
              ))}
            </Select>
          </FormField>
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
