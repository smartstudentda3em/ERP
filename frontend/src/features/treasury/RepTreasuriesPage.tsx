import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DateRangeFilter, DateRange } from '../../components/ui/DateRangeFilter';
import { useToast } from '../../components/ui/Toast';
import { localToday } from '../../lib/date-utils';

interface RepTreasuryBalance {
  salesRepresentativeId: string;
  name: string;
  balance: number;
}

interface BreakdownRow {
  id: string;
  date: string;
  sourceType: 'SALES_INVOICE' | 'SALES_PAYMENT';
  documentNumber: string;
  customerName: string;
  remaining: number;
}

function money(n: number): string {
  return formatAmount(n);
}

function emptyTransferForm() {
  return { toAccount: 'CASH' as 'CASH' | 'BANK', amount: '0', movementDate: localToday(), description: '' };
}

/** Stationery-only detail screen behind the "خزينة المناديب" card on TreasuryTransactionsPage —
 * every sales rep's balance plus, on expand, exactly which outstanding invoices/receipts make it
 * up (see CashMovementsService.getRepTreasuryBreakdown). Reached only via that card's click; not
 * in the sidebar. Air Conditioning/Printing Press never render the card as clickable, but the
 * route itself is guarded here too in case of a direct URL visit. */
export function RepTreasuriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { isStationery, isLoading: companyLoading } = useActiveCompany();
  const canTransfer = useAuthStore((s) => s.hasPermission('treasury.cash-box.create'));
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  const [expandedRepId, setExpandedRepId] = useState<string | null>(null);
  const [transferRep, setTransferRep] = useState<RepTreasuryBalance | null>(null);
  const [transferForm, setTransferForm] = useState(emptyTransferForm());
  const [transferError, setTransferError] = useState<string | null>(null);

  const repTreasuryQuery = useQuery({
    queryKey: ['rep-treasury-balances'],
    queryFn: () => unwrap<RepTreasuryBalance[]>(apiClient.get('/treasury/rep-treasury-balances')),
    enabled: isStationery,
  });

  const breakdownQuery = useQuery({
    queryKey: ['rep-treasury-breakdown', expandedRepId, dateRange],
    queryFn: () =>
      unwrap<BreakdownRow[]>(
        apiClient.get('/treasury/rep-treasury-breakdown', {
          params: {
            salesRepresentativeId: expandedRepId,
            dateFrom: dateRange.from || undefined,
            dateTo: dateRange.to || undefined,
          },
        }),
      ),
    enabled: !!expandedRepId,
  });

  function toggleExpanded(repId: string) {
    setExpandedRepId((current) => (current === repId ? null : repId));
  }

  function closeTransferModal() {
    setTransferRep(null);
    setTransferForm(emptyTransferForm());
    setTransferError(null);
  }

  const transferMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/treasury/cash-movements/transfer', {
        movementDate: transferForm.movementDate,
        fromAccount: 'REP_TREASURY',
        toAccount: transferForm.toAccount,
        amount: Number(transferForm.amount),
        description: transferForm.description || undefined,
        fromSalesRepresentativeId: transferRep?.salesRepresentativeId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rep-treasury-balances'] });
      queryClient.invalidateQueries({ queryKey: ['rep-treasury-breakdown'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      closeTransferModal();
      toast.success(t('common.savedSuccessfully'));
    },
    onError: (err: any) => setTransferError(err?.response?.data?.message ?? t('common.saveFailed')),
  });

  if (companyLoading) return null;
  if (!isStationery) return <Navigate to="/treasury/transactions" replace />;

  const reps = repTreasuryQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title={t('treasury.repTreasuriesBalance')}
        actions={
          <Button variant="secondary" onClick={() => navigate('/treasury/transactions')}>
            {t('treasury.backToTreasury')}
          </Button>
        }
      />

      <DateRangeFilter value={dateRange} onChange={setDateRange} />

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="app-table">
          <thead>
            <tr>
              <th className="w-8" />
              <th>{t('fields.salesRepresentative')}</th>
              <th>{t('treasury.repTreasuryBalance')}</th>
              {canTransfer && <th>{t('common.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {repTreasuryQuery.isLoading ? (
              <tr>
                <td colSpan={4} className="text-[var(--text-muted)]">
                  {t('common.loading')}
                </td>
              </tr>
            ) : reps.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-[var(--text-muted)]">
                  {t('common.noData')}
                </td>
              </tr>
            ) : (
              reps.map((rep) => {
                const expanded = expandedRepId === rep.salesRepresentativeId;
                return (
                  <Fragment key={rep.salesRepresentativeId}>
                    <tr className="cursor-pointer" onClick={() => toggleExpanded(rep.salesRepresentativeId)}>
                      <td>
                        <span className="inline-block text-[var(--text-muted)]">{expanded ? '▾' : '›'}</span>
                      </td>
                      <td>{rep.name}</td>
                      <td>{money(rep.balance)}</td>
                      {canTransfer && (
                        <td>
                          <div className="flex justify-center">
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={rep.balance <= 0.005}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTransferRep(rep);
                              }}
                            >
                              {t('treasury.transferFromRep')}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={canTransfer ? 4 : 3} className="bg-[var(--table-header-bg)] p-3">
                          {breakdownQuery.isLoading ? (
                            <div className="text-[var(--text-muted)]">{t('common.loading')}</div>
                          ) : (breakdownQuery.data ?? []).length === 0 ? (
                            <div className="text-[var(--text-muted)]">{t('common.noData')}</div>
                          ) : (
                            <table className="app-table">
                              <thead>
                                <tr>
                                  <th>{t('common.date')}</th>
                                  <th>{t('treasury.sourceDocument')}</th>
                                  <th>{t('table.documentNumber')}</th>
                                  <th>{t('nav.customers')}</th>
                                  <th>{t('treasury.remainingAmount')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(breakdownQuery.data ?? []).map((row) => (
                                  <tr key={row.id}>
                                    <td>{row.date}</td>
                                    <td>
                                      {row.sourceType === 'SALES_INVOICE'
                                        ? t('treasury.sourceInvoice')
                                        : t('treasury.sourceReceipt')}
                                    </td>
                                    <td>{row.documentNumber}</td>
                                    <td>{row.customerName}</td>
                                    <td>{money(row.remaining)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!transferRep} onClose={closeTransferModal} title={t('treasury.transferFromRep')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            transferMutation.mutate();
          }}
        >
          <div className="col-span-2 text-sm text-[var(--text-muted)]">
            {transferRep?.name} — {money(transferRep?.balance ?? 0)}
          </div>
          <FormField label={t('treasury.toAccount')}>
            <Select
              value={transferForm.toAccount}
              onChange={(e) => setTransferForm((f) => ({ ...f, toAccount: e.target.value as 'CASH' | 'BANK' }))}
            >
              <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
              <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
            </Select>
          </FormField>
          <FormField label={t('treasury.amount')}>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={transferRep?.balance ?? undefined}
              required
              value={transferForm.amount}
              onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </FormField>
          <FormField label={t('common.date')}>
            <Input
              type="date"
              required
              value={transferForm.movementDate}
              onChange={(e) => setTransferForm((f) => ({ ...f, movementDate: e.target.value }))}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label={t('table.description')}>
              <Input
                value={transferForm.description}
                onChange={(e) => setTransferForm((f) => ({ ...f, description: e.target.value }))}
              />
            </FormField>
          </div>
          {transferError && <p className="col-span-2 text-sm text-red-600">{transferError}</p>}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeTransferModal}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={transferMutation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
