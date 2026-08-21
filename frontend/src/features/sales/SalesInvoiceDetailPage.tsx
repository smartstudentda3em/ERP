import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany, useIsSalesRep, useIsBranchManager } from '../../lib/use-active-company';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { FormField, Input, Select } from '../../components/ui/Input';
import { Badge, statusColor } from '../../components/ui/Badge';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdfBlob } from '../../lib/pdf-export';
import { shareEngineHint } from '../../lib/browser-info';
import { DocumentLetterhead, LetterheadCompany } from './DocumentLetterhead';
import { DocumentFooter } from './DocumentFooter';
import { useToast } from '../../components/ui/Toast';

interface InvoiceLine {
  id: string;
  unitKind: 'UNIT' | 'PACKAGE';
  quantity: number;
  baseQuantity: number;
  unitPrice: number;
  lineTotal: number;
  unitCost: number;
  purchasePrice: number;
  suggestedPrice: number;
  profitPerUnit: number;
  totalProfit: number;
  product: {
    nameEn: string;
    sku: string;
    unit?: { nameEn: string } | null;
    packageType?: { nameEn: string } | null;
  };
}

interface Invoice {
  id: string;
  documentNumber: string;
  invoiceDate: string;
  status: string;
  subtotal: number;
  grandTotal: number;
  amountPaid: number;
  costOfGoodsSold: number;
  totalProfit: number;
  companyId: string;
  branchId: string | null;
  customer: { id: string; name: string };
  customerName: string | null;
  customerPhone: string | null;
  paymentAccount: 'CASH' | 'BANK' | null;
  lines: InvoiceLine[];
}

interface Company extends LetterheadCompany {
  id: string;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

function money(n: number): string {
  return formatAmount(n);
}

export function SalesInvoiceDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const { isPrintingPress } = useActiveCompany();
  // The mobile app (مندوب/مدير فرع) never gets a "طباعة" button — there's no printer attached to
  // a phone, and if they really do want a paper copy they'd print from the desktop site anyway.
  // Print stays for every other role (Administrator, Manager, desktop browsing in general).
  const isMobileRestrictedRole = useIsSalesRep() || useIsBranchManager();
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState('0');
  // Printing Press only — which treasury account this collected amount actually lands in. Starts
  // unset (not defaulted to CASH) so the branch manager must explicitly say where the money went,
  // same as the standalone سند قبض form's own paymentAccount field.
  const [paymentAccount, setPaymentAccount] = useState<'CASH' | 'BANK' | ''>('');
  const [shareLoading, setShareLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const invoiceQuery = useQuery({
    queryKey: ['sales-invoice', id],
    queryFn: () => unwrap<Invoice>(apiClient.get(`/sales/invoices/${id}`)),
    enabled: !!id,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });

  // Printing Press only — used solely to show which branch this collection is attributed to (the
  // invoice's own branchId, not a user choice — a payment against a fixed invoice can only ever
  // settle into that same invoice's branch).
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && payOpen && !!companyId,
  });
  const invoiceBranchName = (() => {
    const b = (branchesQuery.data ?? []).find((br) => br.id === invoiceQuery.data?.branchId);
    return b ? b.nameAr || b.nameEn : '—';
  })();

  const payMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/sales/payments', {
        paymentDate: localToday(),
        customerId: invoiceQuery.data?.customer.id,
        invoiceId: id,
        companyId: invoiceQuery.data?.companyId,
        method: isPrintingPress ? undefined : 'CASH',
        paymentAccount: isPrintingPress ? paymentAccount || undefined : undefined,
        branchId: isPrintingPress ? invoiceQuery.data?.branchId ?? undefined : undefined,
        amount: Number(amount),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['sales-payments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-recent-tx'] });
      queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
      setPayOpen(false);
      setPaymentAccount('');
    },
  });

  const inv = invoiceQuery.data;
  const balanceDue = inv ? Number(inv.grandTotal ?? 0) - Number(inv.amountPaid ?? 0) : 0;
  const company =
    companiesQuery.data?.find((c) => c.id === (inv?.companyId ?? companyId)) ?? companiesQuery.data?.[0];

  /**
   * "مشاركة" — one button that replaces the old separate "تحميل PDF"/"إرسال عبر واتساب" pair.
   * Builds the invoice PDF as an in-memory Blob (never touches disk) and hands it straight to the
   * OS share sheet via the Web Share API's file-sharing support (Level 2) — on Android this lets
   * the sender pick WhatsApp, or any other installed app, and land the file directly in a chat
   * without a separate "download it, then go attach it" step. WhatsApp's own `wa.me`/
   * `api.whatsapp.com` deep links can only pre-fill TEXT, never attach a file, so a native
   * share-sheet handoff is the only way to actually deliver the PDF itself. There's no way to
   * pre-select *which* chat opens; the sender still picks the contact themselves, same as sharing
   * a photo from the Gallery app would work. Falls back to a plain download only on a browser that
   * doesn't support file sharing at all (e.g. desktop Chrome), so the button still does *something*
   * useful everywhere rather than just failing.
   */
  async function handleShareInvoice() {
    if (!printRef.current || !inv) return;
    setShareLoading(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      const filename = buildPdfFileName('فاتورة بيع', inv.customer?.name, inv.documentNumber);
      const blob = await exportElementToPdfBlob(printRef.current, 'portrait');
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return; // shared successfully — nothing left to do
        } catch (err: any) {
          // AbortError just means the user closed the share sheet without picking anything — leave
          // it at that, don't force a download they didn't ask for. Any OTHER failure (a real
          // Android device throws things like NotAllowedError when the share call ends up outside
          // the browser's "user gesture" window — easy to hit here since the PDF capture above is
          // async — or a WebView quirk) falls through to the download below instead of erroring out.
          if (err?.name === 'AbortError') return;
        }
      }

      // No native share support (or the attempt above failed) — reuses the blob already captured
      // instead of re-running html2canvas. A plain forced download, and nothing fancier: this app
      // runs inside an installed TWA (a single-activity Android wrapper, not a normal tabbed
      // browser) on the phones that actually hit this path, and window.open()-based "view it first"
      // attempts were tried and abandoned here — one threw outright, the other silently opened a
      // window with no visible content, since a TWA has nowhere to render a second window/tab. The
      // browser's own "save file?" confirmation (unavoidable — no page can suppress it) is the
      // trade-off for a path that reliably puts the file on the device at all.
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      // Engine name appended temporarily — canShare({files}) came back false/undefined here, and
      // there's no way to tell from this side of the API whether Android handed this TWA to Chrome
      // (should support file sharing) or to Samsung Internet (historically weak/no support for it)
      // without asking the browser itself. Remove once that's confirmed.
      toast.warning(`${t('actions.shareNotSupported')} (${shareEngineHint()})`);
    } catch (err) {
      // Only a genuine failure to generate the PDF itself (before any share/download attempt) ends
      // up here.
      toast.error(t('common.saveFailed'));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setShareLoading(false);
    }
  }

  // Lets the invoices table's row-level طباعة/مشاركة buttons trigger the action immediately on
  // arrival, via ?autoprint=1 / ?autopdf=1, instead of requiring a second click on this page.
  useEffect(() => {
    if (!inv) return;
    if (searchParams.get('autoprint') === '1' && !isMobileRestrictedRole) {
      window.print();
    } else if (searchParams.get('autopdf') === '1') {
      handleShareInvoice();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inv]);

  return (
    <div>
      <PageHeader
        title={`${t('nav.salesInvoices')} — ${inv?.documentNumber ?? ''}`}
        actions={
          inv ? (
            <div className="flex flex-wrap gap-2 print:hidden">
              {!isMobileRestrictedRole && (
                <Button variant="secondary" onClick={() => window.print()}>
                  {t('common.print')}
                </Button>
              )}
              <Button variant="secondary" onClick={handleShareInvoice} loading={shareLoading}>
                {t('actions.shareInvoice')}
              </Button>
              {balanceDue > 0 && (
                <Button
                  onClick={() => {
                    setAmount(formatAmount(balanceDue));
                    setPayOpen(true);
                  }}
                >
                  {t('actions.recordPayment')}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {inv && (
        <div ref={printRef} className="printable-document">
          <DocumentLetterhead
            docTypeLabel={t('printDocument.invoiceTitle')}
            metaLine={`${t('printDocument.invoiceNumberLabel')}: ${inv.documentNumber}  |  ${t('common.date')}: ${inv.invoiceDate}`}
            company={company}
          />

          <div className="mb-4 flex justify-end">
            <Badge color={statusColor(inv.status)}>{t(`docStatus.${inv.status}`, inv.status)}</Badge>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('nav.customers')}</div>
              <div className="font-medium">{inv.customerName || inv.customer.name}</div>
            </Card>
            {inv.customerPhone && (
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('fields.phone')}</div>
                <div className="font-medium">{inv.customerPhone}</div>
              </Card>
            )}
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('common.date')}</div>
              <div className="font-medium">{inv.invoiceDate}</div>
            </Card>
            {inv.paymentAccount && (
              <Card>
                <div className="text-xs text-[var(--text-muted)]">{t('table.paymentMethod')}</div>
                <div className="font-medium">{t(`treasury.paymentAccounts.${inv.paymentAccount}`)}</div>
              </Card>
            )}
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('common.total')}</div>
              <div className="font-medium">{money(inv.grandTotal)}</div>
            </Card>
            <Card>
              <div className="text-xs text-[var(--text-muted)]">{t('actions.balanceDue')}</div>
              <div className="font-medium">{money(balanceDue)}</div>
            </Card>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="app-table">
                <thead>
                  <tr>
                    <th>{t('fields.product')}</th>
                    <th>{t('fields.quantity')}</th>
                    <th>{t('fields.unit')}</th>
                    <th>{t('fields.suggestedPrice')}</th>
                    <th>{t('fields.actualSellingPrice')}</th>
                    <th>{t('common.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <bdi dir="ltr">
                          {l.product.sku} — {l.product.nameEn}
                        </bdi>
                      </td>
                      <td>{money(l.quantity)}</td>
                      <td className="text-[var(--text-muted)]">
                        <bdi dir="ltr">{l.unitKind === 'PACKAGE' ? l.product.packageType?.nameEn : l.product.unit?.nameEn}</bdi>
                        {l.unitKind === 'PACKAGE' && (
                          <div className="text-xs">
                            <bdi dir="ltr">
                              ({money(l.baseQuantity)} {l.product.unit?.nameEn})
                            </bdi>
                          </div>
                        )}
                      </td>
                      <td className="text-[var(--text-muted)]">{money(l.suggestedPrice)}</td>
                      <td className="font-medium">{money(l.unitPrice)}</td>
                      <td>{money(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-6 ms-auto w-full max-w-xs space-y-2 rounded-lg border border-[var(--border)] p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t('fields.subtotal')}</span>
                <span className="font-medium">{money(inv.subtotal)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold">
                <span>{t('fields.totalSaleAmount')}</span>
                <span>{money(inv.grandTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t('fields.paidAmount')}</span>
                <span className="font-medium">{money(inv.amountPaid)}</span>
              </div>
              <div className="flex justify-between border-t border-[var(--border)] pt-2 text-base font-bold text-red-600">
                <span>{t('actions.balanceDue')}</span>
                <span>{money(balanceDue)}</span>
              </div>
            </div>
          </Card>

          <DocumentFooter />
        </div>
      )}

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t('actions.recordPayment')}>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            payMutation.mutate();
          }}
        >
          <FormField label={t('fields.amount')}>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </FormField>
          {isPrintingPress && (
            <FormField label={t('salesPayments.depositAccountLabel')} required>
              <Select
                required
                value={paymentAccount}
                onChange={(e) => setPaymentAccount(e.target.value as 'CASH' | 'BANK' | '')}
              >
                <option value="">{t('salesPayments.selectDepositAccount')}</option>
                <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
              </Select>
            </FormField>
          )}
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Input disabled value={invoiceBranchName} />
            </FormField>
          )}
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPayOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={payMutation.isPending || (isPrintingPress && !paymentAccount)}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
