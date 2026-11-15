import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount, formatQuantity } from '../../lib/number-format';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

interface ReceiptDetail {
  id: string;
  documentNumber: string;
  receiptDate: string;
  quantityPackages: number;
  unitsPerPackage: number;
  totalUnits: number;
  packagePurchasePrice: number;
  unitCost: number;
  totalAmount: number;
  paidAmount: number;
  packageSellingPrice: number | null;
  unitSellingPrice: number | null;
  notes: string | null;
  isFreeGoods?: boolean;
  paymentSource: 'CASH' | 'BANK' | 'REP_TREASURY' | 'SUPPLIER_BALANCE' | null;
  createdAt: string;
  createdByName: string | null;
  product?: { nameAr?: string | null; nameEn: string };
  warehouse?: { nameAr?: string | null; nameEn: string };
  supplier?: { companyName?: string; name?: string };
  branch?: { nameAr?: string | null; nameEn: string } | null;
  payments: { date: string; documentNumber: string; amount: number; account: 'CASH' | 'BANK' | 'REP_TREASURY' }[];
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

/** Everything about one purchase receipt ("فاتورة شراء") on its own page — opened by clicking a row in
 * the purchases list. Read-only; editing/deleting stay on the list's own buttons. */
export function PurchaseReceiptDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();

  const query = useQuery({
    queryKey: ['purchase-receipt', id],
    queryFn: () => unwrap<ReceiptDetail>(apiClient.get(`/inventory/purchase-receipts/${id}`)),
    enabled: !!id,
  });
  const r = query.data;
  const dash = '—';
  const paymentSource = r?.paymentSource ? t(`treasury.paymentAccounts.${r.paymentSource}`, r.paymentSource) : dash;
  const remaining = r ? Number(r.totalAmount) - Number(r.paidAmount ?? 0) : 0;

  return (
    <div>
      <PageHeader
        title={`${t('purchasing.detail.title')}${r ? ` — ${r.documentNumber}` : ''}`}
        actions={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            {t('purchasing.detail.back')}
          </Button>
        }
      />

      {query.isLoading && <p className="text-sm text-[var(--text-muted)]">{t('common.loading', 'جارٍ التحميل…')}</p>}
      {query.isError && <p className="text-sm text-red-600">{t('purchasing.detail.notFound')}</p>}

      {r && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('purchasing.detail.basic')}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Field label={t('purchasing.detail.docNumber')}>{r.documentNumber}</Field>
              <Field label={t('purchasing.detail.date')}>{r.receiptDate}</Field>
              <Field label={t('purchasing.detail.supplier')}>{r.supplier?.companyName ?? r.supplier?.name ?? dash}</Field>
              <Field label={t('purchasing.detail.product')}>{r.product?.nameAr || r.product?.nameEn || dash}</Field>
              <Field label={t('purchasing.detail.warehouse')}>{r.warehouse?.nameAr || r.warehouse?.nameEn || dash}</Field>
              {r.branch && <Field label={t('purchasing.detail.branch')}>{r.branch.nameAr || r.branch.nameEn}</Field>}
              <Field label={t('purchasing.detail.createdBy')}>{r.createdByName ?? dash}</Field>
              <Field label={t('purchasing.detail.createdAt')}>{new Date(r.createdAt).toLocaleString()}</Field>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('purchasing.detail.quantitiesPrices')}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Field label={t('purchasing.detail.quantityPackages')}>{formatAmount(r.quantityPackages)}</Field>
              <Field label={t('purchasing.detail.unitsPerPackage')}>{formatQuantity(r.unitsPerPackage)}</Field>
              <Field label={t('purchasing.detail.totalUnits')}>{formatQuantity(r.totalUnits)}</Field>
              <Field label={t('purchasing.detail.packagePrice')}>{formatAmount(r.packagePurchasePrice)}</Field>
              <Field label={t('purchasing.detail.unitCost')}>{Number(r.unitCost).toFixed(4)}</Field>
              <Field label={t('purchasing.detail.sellPackage')}>
                {r.packageSellingPrice != null ? formatAmount(r.packageSellingPrice) : dash}
              </Field>
              <Field label={t('purchasing.detail.sellUnit')}>
                {r.unitSellingPrice != null ? formatAmount(r.unitSellingPrice) : dash}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('purchasing.detail.payment')}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label={t('purchasing.detail.total')}>{formatAmount(r.totalAmount)}</Field>
              <Field label={t('purchasing.detail.paid')}>{formatAmount(r.paidAmount ?? 0)}</Field>
              <Field label={t('purchasing.detail.remaining')}>
                <span className={remaining > 0 ? 'text-orange-600' : 'text-green-600'}>{formatAmount(remaining)}</span>
              </Field>
              <Field label={t('purchasing.detail.paymentSource')}>{paymentSource}</Field>
            </div>

            <div className="mt-4">
              <div className="mb-2 text-xs text-[var(--text-muted)]">{t('purchasing.detail.payments')}</div>
              {r.payments.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('purchasing.detail.noPayments')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>{t('purchasing.detail.date')}</th>
                        <th>{t('purchasing.detail.docNumber')}</th>
                        <th>{t('purchasing.detail.account')}</th>
                        <th>{t('purchasing.detail.amount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.payments.map((p) => (
                        <tr key={p.documentNumber}>
                          <td>{p.date}</td>
                          <td>{p.documentNumber}</td>
                          <td>{t(`treasury.paymentAccounts.${p.account}`, p.account)}</td>
                          <td>{formatAmount(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('purchasing.detail.notes')}</CardTitle>
            </CardHeader>
            <p className="whitespace-pre-line text-sm">{r.notes?.trim() ? r.notes : dash}</p>
          </Card>
        </div>
      )}
    </div>
  );
}
