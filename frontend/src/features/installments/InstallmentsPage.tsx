import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { localToday } from '../../lib/date-utils';
import { computeInstallmentTerms, generateInstallmentSchedule } from '../../lib/installment-calculator';

interface InstallmentPlanRow {
  id: string;
  documentNumber: string;
  customerId: string;
  customerName: string;
  purchaseDate: string;
  totalPayable: number;
  installmentAmount: number;
  remainingBalance: number;
  nextDueDate: string | null;
  status: string;
}
interface Customer {
  id: string;
  name: string;
  creditStatus?: string;
  blockedReason?: string | null;
}
interface Warehouse {
  id: string;
  nameEn: string;
}
interface Product {
  id: string;
  sku: string;
  nameEn: string;
  sellingPrice: number | null;
}
interface LineForm {
  productId: string;
  quantity: string;
  unitPrice: string;
}

function emptyLine(): LineForm {
  return { productId: '', quantity: '1', unitPrice: '0' };
}

const PLAN_STATUS_COLOR: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  ACTIVE: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'red',
  SETTLED_EARLY: 'green',
};

export function InstallmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(localToday());
  const [downPayment, setDownPayment] = useState('0');
  const [interestType, setInterestType] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [interestRate, setInterestRate] = useState('0');
  const [tenureMonths, setTenureMonths] = useState('6');
  const [lines, setLines] = useState<LineForm[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ['installment-plans', companyId],
    queryFn: () => unwrap<InstallmentPlanRow[]>(apiClient.get('/installments', { params: { companyId } })),
    enabled: !!companyId,
  });
  const customersQuery = useQuery({
    queryKey: ['customers', companyId],
    queryFn: () => unwrap<Customer[]>(apiClient.get('/customers', { params: { companyId } })),
    enabled: modalOpen && !!companyId,
  });
  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => unwrap<Warehouse[]>(apiClient.get('/settings/warehouses')),
    enabled: modalOpen,
  });
  const productsQuery = useQuery({
    queryKey: ['products', companyId],
    queryFn: () => unwrap<Product[]>(apiClient.get('/inventory/products', { params: { companyId } })),
    enabled: modalOpen,
  });

  const selectedCustomer = customersQuery.data?.find((c) => c.id === customerId);
  const isBlocked = selectedCustomer?.creditStatus === 'BLOCKED';

  const totalPrice = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0),
    [lines],
  );
  const terms = useMemo(
    () =>
      computeInstallmentTerms(
        totalPrice,
        Number(downPayment) || 0,
        interestType,
        Number(interestRate) || 0,
        Number(tenureMonths) || 1,
      ),
    [totalPrice, downPayment, interestType, interestRate, tenureMonths],
  );
  const schedulePreview = useMemo(
    () => generateInstallmentSchedule(purchaseDate, terms, Number(tenureMonths) || 0),
    [purchaseDate, terms, tenureMonths],
  );

  function updateLine(index: number, patch: Partial<LineForm>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }
  function resetForm() {
    setCustomerId('');
    setWarehouseId('');
    setPurchaseDate(localToday());
    setDownPayment('0');
    setInterestType('MONTHLY');
    setInterestRate('0');
    setTenureMonths('6');
    setLines([emptyLine()]);
    setError(null);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/installments', {
        customerId,
        warehouseId,
        purchaseDate,
        downPayment: Number(downPayment) || 0,
        interestType,
        interestRate: Number(interestRate) || 0,
        tenureMonths: Number(tenureMonths) || 1,
        lines: lines
          .filter((l) => l.productId)
          .map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
      setModalOpen(false);
      resetForm();
    },
    onError: (err: any) => setError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const columns: Column<InstallmentPlanRow>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('nav.customers'), accessor: (r) => r.customerName },
    { header: t('common.date'), accessor: (r) => r.purchaseDate },
    { header: t('installments.totalPayable'), accessor: (r) => formatAmount(r.totalPayable), align: 'right' },
    { header: t('installments.installmentAmount'), accessor: (r) => formatAmount(r.installmentAmount), align: 'right' },
    { header: t('installments.remainingBalance'), accessor: (r) => formatAmount(r.remainingBalance), align: 'right' },
    { header: t('installments.nextDueDate'), accessor: (r) => r.nextDueDate ?? '—' },
    {
      header: t('common.status'),
      accessor: (r) => (
        <Badge color={PLAN_STATUS_COLOR[r.status] ?? 'gray'}>{t(`installments.status.${r.status}`, r.status)}</Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.installments')}
        actions={<Button onClick={() => setModalOpen(true)}>+ {t('installments.newPlan')}</Button>}
      />

      <DataTable
        columns={columns}
        data={plansQuery.data ?? []}
        keyField={(r) => r.id}
        isLoading={plansQuery.isLoading}
        onRowClick={(r) => navigate(`/installments/${r.id}`)}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={t('installments.newPlan')} widthClass="max-w-4xl">
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
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

          {isBlocked && (
            <div className="col-span-2 rounded-lg bg-red-100 p-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-300">
              {t('installments.customerBlocked')}: {selectedCustomer?.blockedReason || '—'}
            </div>
          )}

          <FormField label={t('installments.purchaseDate')}>
            <Input type="date" required value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </FormField>
          <FormField label={t('installments.downPayment')}>
            <Input type="number" step="0.01" min="0" value={downPayment} onChange={(e) => setDownPayment(e.target.value)} />
          </FormField>
          <FormField label={t('installments.interestType')}>
            <Select value={interestType} onChange={(e) => setInterestType(e.target.value as 'MONTHLY' | 'YEARLY')}>
              <option value="MONTHLY">{t('installments.monthly')}</option>
              <option value="YEARLY">{t('installments.yearly')}</option>
            </Select>
          </FormField>
          <FormField label={t('installments.interestRate')}>
            <Input type="number" step="0.01" min="0" value={interestRate} onChange={(e) => setInterestRate(e.target.value)} />
          </FormField>
          <FormField label={t('installments.tenureMonths')}>
            <Input type="number" step="1" min="1" value={tenureMonths} onChange={(e) => setTenureMonths(e.target.value)} />
          </FormField>

          <div className="col-span-2 rounded-lg border border-[var(--border)] p-3">
            <div className="mb-2 text-sm font-medium">{t('installments.lines')}</div>
            {lines.map((line, idx) => (
              <div key={idx} className="mb-2 grid grid-cols-[1fr_100px_120px_auto] items-center gap-2">
                <Select
                  value={line.productId}
                  onChange={(e) => {
                    const product = productsQuery.data?.find((p) => p.id === e.target.value);
                    updateLine(idx, {
                      productId: e.target.value,
                      unitPrice: product?.sellingPrice != null ? String(product.sellingPrice) : line.unitPrice,
                    });
                  }}
                >
                  <option value="">{t('actions.selectProduct')}</option>
                  {(productsQuery.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.nameEn}
                    </option>
                  ))}
                </Select>
                <Input type="number" step="1" min="1" value={line.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={line.unitPrice}
                  onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                />
                <Button type="button" variant="secondary" onClick={() => removeLine(idx)}>
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" onClick={addLine}>
              + {t('installments.addLine')}
            </Button>
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-4">
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('installments.totalPrice')}</div>
              <div className="font-semibold">{formatAmount(totalPrice)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('installments.financedPrincipal')}</div>
              <div className="font-semibold">{formatAmount(terms.financedPrincipal)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('installments.totalInterest')}</div>
              <div className="font-semibold">{formatAmount(terms.totalInterestAmount)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('installments.installmentAmount')}</div>
              <div className="font-semibold">{formatAmount(terms.installmentAmount)}</div>
            </div>
          </div>

          {Number(tenureMonths) > 0 && (
            <div className="col-span-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface)]">
                  <tr>
                    <th className="p-2 text-start">#</th>
                    <th className="p-2 text-start">{t('installments.dueDate')}</th>
                    <th className="p-2 text-end">{t('installments.principal')}</th>
                    <th className="p-2 text-end">{t('installments.interest')}</th>
                    <th className="p-2 text-end">{t('installments.amountDue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulePreview.map((s) => (
                    <tr key={s.installmentNumber} className="border-t border-[var(--border)]">
                      <td className="p-2">{s.installmentNumber}</td>
                      <td className="p-2">{s.dueDate}</td>
                      <td className="p-2 text-end">{formatAmount(s.principalPortion)}</td>
                      <td className="p-2 text-end">{formatAmount(s.interestPortion)}</td>
                      <td className="p-2 text-end">{formatAmount(s.amountDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={createMutation.isPending || isBlocked}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
