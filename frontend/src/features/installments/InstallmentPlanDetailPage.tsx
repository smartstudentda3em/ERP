import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { localToday } from '../../lib/date-utils';

interface ScheduleItemView {
  id: string;
  installmentNumber: number;
  dueDate: string;
  principalPortion: number;
  interestPortion: number;
  amountDue: number;
  amountPaid: number;
  remaining: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
}
interface PlanDetail {
  plan: {
    id: string;
    documentNumber: string;
    purchaseDate: string;
    downPayment: number;
    interestType: string;
    interestRate: number;
    tenureMonths: number;
    financedPrincipal: number;
    totalInterestAmount: number;
    totalPayable: number;
    installmentAmount: number;
    status: string;
    settlementDiscountAmount?: number | null;
    customer: { id: string; name: string; mobile?: string; creditStatus?: string; blockedReason?: string | null } | null;
    warehouse: { nameEn: string } | null;
    lines: Array<{ id: string; quantity: number; unitPrice: number; lineTotal: number; product?: { nameEn: string } | null }>;
  };
  schedule: ScheduleItemView[];
  downPaymentAmount: number;
}

const ITEM_STATUS_COLOR: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  PENDING: 'gray',
  PARTIALLY_PAID: 'yellow',
  PAID: 'green',
  OVERDUE: 'red',
};

function money(n: number) {
  return formatAmount(n);
}

export function InstallmentPlanDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [payingItem, setPayingItem] = useState<ScheduleItemView | null>(null);
  const [payAmount, setPayAmount] = useState('0');
  const [payDate, setPayDate] = useState(localToday());
  const [payMethod, setPayMethod] = useState('CASH');
  const [payError, setPayError] = useState<string | null>(null);

  const [settleOpen, setSettleOpen] = useState(false);
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState('0');
  const [settleMethod, setSettleMethod] = useState('CASH');
  const [settleNotes, setSettleNotes] = useState('');
  const [settleError, setSettleError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['installment-plan', id],
    queryFn: () => unwrap<PlanDetail>(apiClient.get(`/installments/${id}`)),
    enabled: !!id,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['installment-plan', id] });
    queryClient.invalidateQueries({ queryKey: ['installment-plans'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };

  const payMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/installments/${id}/schedule/${payingItem?.id}/payments`, {
        amount: Number(payAmount),
        paymentDate: payDate,
        method: payMethod,
      }),
    onSuccess: () => {
      invalidateAll();
      setPayingItem(null);
    },
    onError: (err: any) => setPayError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  const remainingPrincipal = useMemo(
    () => (detailQuery.data?.schedule ?? []).reduce((s, v) => s + (v.remaining > 0.005 ? (v.remaining / v.amountDue) * v.principalPortion : 0), 0),
    [detailQuery.data],
  );
  const remainingInterest = useMemo(
    () => (detailQuery.data?.schedule ?? []).reduce((s, v) => s + (v.remaining > 0.005 ? (v.remaining / v.amountDue) * v.interestPortion : 0), 0),
    [detailQuery.data],
  );
  const discountAmount = discountMode === 'amount' ? Number(discountValue) || 0 : (remainingInterest * (Number(discountValue) || 0)) / 100;
  const finalSettlementAmount = Math.max(0, remainingPrincipal + remainingInterest - discountAmount);

  const settleMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/installments/${id}/settle-early`, {
        [discountMode === 'amount' ? 'discountAmount' : 'discountPercent']: Number(discountValue) || 0,
        settlementDate: localToday(),
        method: settleMethod,
        notes: settleNotes || undefined,
      }),
    onSuccess: () => {
      invalidateAll();
      setSettleOpen(false);
    },
    onError: (err: any) => setSettleError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div>
        <PageHeader title={t('installments.planDetails')} />
        <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
      </div>
    );
  }

  const { plan, schedule, downPaymentAmount } = detailQuery.data;
  const isActive = plan.status === 'ACTIVE';

  const columns: Column<ScheduleItemView>[] = [
    { header: '#', accessor: (r) => r.installmentNumber },
    { header: t('installments.dueDate'), accessor: (r) => r.dueDate },
    { header: t('installments.amountDue'), accessor: (r) => money(r.amountDue), align: 'right' },
    { header: t('fields.paidAmount'), accessor: (r) => money(r.amountPaid), align: 'right' },
    { header: t('fields.remainingAmount'), accessor: (r) => money(r.remaining), align: 'right' },
    {
      header: t('common.status'),
      accessor: (r) => <Badge color={ITEM_STATUS_COLOR[r.status]}>{t(`installments.itemStatus.${r.status}`, r.status)}</Badge>,
    },
    {
      header: t('common.actions'),
      accessor: (r) =>
        r.remaining > 0.005 && isActive ? (
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setPayingItem(r);
              setPayAmount(String(r.remaining));
              setPayDate(localToday());
              setPayMethod('CASH');
              setPayError(null);
            }}
          >
            {t('installments.recordPayment')}
          </button>
        ) : (
          '—'
        ),
      align: 'center',
    },
  ];

  return (
    <div>
      <PageHeader title={`${t('installments.planDetails')} — ${plan.documentNumber}`} />
      <Button variant="secondary" onClick={() => navigate('/installments')} className="mb-3">
        {t('installments.backToList')}
      </Button>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('nav.customers')}</div>
          <div className="mt-1 font-semibold">{plan.customer?.name ?? '—'}</div>
          {plan.customer?.creditStatus === 'BLOCKED' && (
            <div className="mt-1 text-xs text-red-600">
              {t('installments.customerBlocked')}: {plan.customer.blockedReason}
            </div>
          )}
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('installments.totalPayable')}</div>
          <div className="mt-1 text-xl font-semibold">{money(plan.totalPayable)}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('installments.downPayment')}</div>
          <div className="mt-1 text-xl font-semibold">{money(downPaymentAmount)}</div>
        </Card>
        <Card>
          <div className="text-xs text-[var(--text-muted)]">{t('common.status')}</div>
          <div className="mt-1">
            <Badge color={plan.status === 'ACTIVE' ? 'blue' : plan.status === 'CANCELLED' ? 'red' : 'green'}>
              {t(`installments.status.${plan.status}`, plan.status)}
            </Badge>
          </div>
        </Card>
      </div>

      <DataTable columns={columns} data={schedule} keyField={(r) => r.id} searchable={false} />

      {isActive && (
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={() => setSettleOpen(true)}>
            {t('installments.earlySettlement')}
          </Button>
        </div>
      )}

      <Modal open={!!payingItem} onClose={() => setPayingItem(null)} title={t('installments.recordPayment')}>
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            payMutation.mutate();
          }}
        >
          <FormField label={t('fields.amount')}>
            <Input type="number" step="0.01" min="0.01" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </FormField>
          <FormField label={t('common.date')}>
            <Input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </FormField>
          <FormField label={t('fields.method')}>
            <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="CASH">{t('paymentMethod.CASH')}</option>
              <option value="BANK_TRANSFER">{t('paymentMethod.BANK_TRANSFER')}</option>
              <option value="CHEQUE">{t('paymentMethod.CHEQUE')}</option>
              <option value="CARD">{t('paymentMethod.CARD')}</option>
              <option value="ONLINE">{t('paymentMethod.ONLINE')}</option>
            </Select>
          </FormField>
          {payError && <p className="text-sm text-red-600">{payError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPayingItem(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={payMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={settleOpen} onClose={() => setSettleOpen(false)} title={t('installments.earlySettlement')}>
        <form
          className="grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            settleMutation.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] p-3 text-sm">
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('installments.remainingPrincipal')}</div>
              <div className="font-semibold">{money(remainingPrincipal)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">{t('installments.remainingInterest')}</div>
              <div className="font-semibold">{money(remainingInterest)}</div>
            </div>
          </div>

          <FormField label={t('installments.discountType')}>
            <Select value={discountMode} onChange={(e) => setDiscountMode(e.target.value as 'amount' | 'percent')}>
              <option value="amount">{t('installments.discountAmount')}</option>
              <option value="percent">{t('installments.discountPercent')}</option>
            </Select>
          </FormField>
          <FormField label={discountMode === 'amount' ? t('installments.discountAmount') : t('installments.discountPercent')}>
            <Input type="number" step="0.01" min="0" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          </FormField>
          <FormField label={t('fields.method')}>
            <Select value={settleMethod} onChange={(e) => setSettleMethod(e.target.value)}>
              <option value="CASH">{t('paymentMethod.CASH')}</option>
              <option value="BANK_TRANSFER">{t('paymentMethod.BANK_TRANSFER')}</option>
            </Select>
          </FormField>
          <FormField label={t('table.description')}>
            <Input value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} />
          </FormField>

          <div className="rounded-lg border border-[var(--border)] p-3 text-sm">
            <div className="flex justify-between">
              <span>{t('installments.finalSettlementAmount')}</span>
              <span className="font-semibold">{money(finalSettlementAmount)}</span>
            </div>
          </div>

          {settleError && <p className="text-sm text-red-600">{settleError}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setSettleOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={settleMutation.isPending}>
              {t('common.confirm')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
