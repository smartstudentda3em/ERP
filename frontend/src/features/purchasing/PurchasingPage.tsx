import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input, FormField, Select } from '../../components/ui/Input';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useAuthStore } from '../../store/auth-store';
import { DateRangeFilter, DateRange, inDateRange } from '../../components/ui/DateRangeFilter';
import { localToday } from '../../lib/date-utils';
import { formatAmount } from '../../lib/number-format';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { useActiveCompany } from '../../lib/use-active-company';

interface Company {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

interface Product {
  id: string;
  sku?: string;
  barcode?: string;
  nameEn: string;
  packageTypeId: string;
  unitsPerPackage: number;
}

interface Warehouse {
  id: string;
  nameEn: string;
  nameAr?: string | null;
  branchId?: string | null;
}

interface Branch {
  id: string;
  nameEn: string;
  nameAr?: string | null;
}

interface PackageType {
  id: string;
  nameEn: string;
}

interface Supplier {
  id: string;
  companyName: string;
}

interface PurchaseReceipt {
  id: string;
  documentNumber: string;
  receiptDate: string;
  productId: string;
  warehouseId: string;
  supplierId: string;
  branchId?: string | null;
  quantityPackages: number;
  unitsPerPackage: number;
  totalUnits: number;
  packagePurchasePrice: number;
  packageSellingPrice: number | null;
  unitSellingPrice: number | null;
  unitCost: number;
  totalAmount: number;
  paidAmount: number;
  product?: Product;
  warehouse?: Warehouse;
  supplier?: Supplier;
}

const emptyForm = {
  receiptDate: localToday(),
  warehouseId: '',
  branchId: '',
  supplierId: '',
  quantityPackages: '',
  packagePurchasePrice: '',
  packageSellingPrice: '',
  unitSellingPrice: '',
  paidAmount: '',
  // Printing Press only — every other company's payment always settles into BANK (see saveMutation).
  paymentAccount: 'CASH' as 'CASH' | 'BANK',
};

/** Print/PDF are triggered from the parent's own top bar (the standalone PurchasingPage's
 * PageHeader, or — for the Printing Press tenant — SuppliersPage's unified top bar when this is
 * embedded as its "فواتير الشراء" tab), not from a button rendered inside this component. */
export interface PurchasingTabHandle {
  print: () => void;
  downloadPdf: () => Promise<void>;
}

interface PurchasingTabProps {
  /** Lets the parent's "تحميل PDF" button (which lives outside this component) disable itself
   * for the duration of the export, since `pdfLoading` itself can't be read through a ref. */
  onPdfLoadingChange?: (loading: boolean) => void;
}

export const PurchasingTab = forwardRef<PurchasingTabHandle, PurchasingTabProps>(function PurchasingTab(
  { onPdfLoadingChange },
  ref,
) {
  const { t } = useTranslation();
  const { isPrintingPress } = useActiveCompany();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ from: '', to: '' });
  // Filters the receipts table itself (supplier/item name) — separate from `search` above, which
  // only drives the "pick a product to add" lookup inside the new-receipt form.
  const [tableSearch, setTableSearch] = useState('');

  useEffect(() => {
    onPdfLoadingChange?.(pdfLoading);
  }, [pdfLoading, onPdfLoadingChange]);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => unwrap<Product[]>(apiClient.get('/inventory/products')),
  });

  // Keyed (and scoped) by companyId — same convention as every other screen that reads this
  // resource (StockAuditPage, PartnersPage, TreasuryTransactionsPage, ...). Without it, React
  // Query would happily keep serving whichever company's warehouse list was cached first under
  // the bare 'warehouses' key, even after switching companies — the previous unscoped key here
  // was exactly why a stale/unrelated warehouse could still show up after picking a branch.
  const warehousesQuery = useQuery({
    queryKey: ['warehouses', companyId],
    queryFn: () => unwrap<Warehouse[]>(apiClient.get('/settings/warehouses', { params: { companyId } })),
    enabled: !!companyId,
  });

  // Printing Press only: lets the Branch field filter/auto-select the linked Warehouse below.
  const branchesQuery = useQuery({
    queryKey: ['branches', companyId],
    queryFn: () => unwrap<Branch[]>(apiClient.get('/settings/branches', { params: { companyId } })),
    enabled: isPrintingPress && !!companyId,
  });

  const filteredWarehouses = useMemo(() => {
    const all = warehousesQuery.data ?? [];
    return isPrintingPress && form.branchId ? all.filter((w) => w.branchId === form.branchId) : all;
  }, [isPrintingPress, form.branchId, warehousesQuery.data]);

  const packageTypesQuery = useQuery({
    queryKey: ['package-types'],
    queryFn: () => unwrap<PackageType[]>(apiClient.get('/settings/package-types')),
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => unwrap<Supplier[]>(apiClient.get('/suppliers')),
  });

  const receiptsQuery = useQuery({
    queryKey: ['purchase-receipts'],
    queryFn: () => unwrap<PurchaseReceipt[]>(apiClient.get('/inventory/purchase-receipts')),
  });

  const selectedProduct = productsQuery.data?.find((p) => p.id === selectedProductId) ?? null;

  const filteredReceipts = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    return (receiptsQuery.data ?? []).filter((r) => {
      if (!inDateRange(r.receiptDate, dateRange)) return false;
      if (!q) return true;
      return (r.supplier?.companyName ?? '').toLowerCase().includes(q) || (r.product?.nameEn ?? '').toLowerCase().includes(q);
    });
  }, [receiptsQuery.data, dateRange, tableSearch]);

  // Sum of `totalAmount` across whatever's currently on screen — recomputes live as the date
  // range or the supplier/item search narrows filteredReceipts.
  const totalFilteredPurchases = useMemo(
    () => filteredReceipts.reduce((sum, r) => sum + Number(r.totalAmount || 0), 0),
    [filteredReceipts],
  );

  const searchResults = useMemo(() => {
    if (!search.trim() || selectedProduct) return [];
    const q = search.trim().toLowerCase();
    return (productsQuery.data ?? [])
      .filter((p) => [p.nameEn, p.sku, p.barcode].some((v) => (v ?? '').toLowerCase().includes(q)))
      .slice(0, 8);
  }, [search, selectedProduct, productsQuery.data]);

  function packageTypeName(id?: string): string {
    return packageTypesQuery.data?.find((p) => p.id === id)?.nameEn ?? '—';
  }

  const unitsPerPackage = selectedProduct?.unitsPerPackage ?? null;
  // A selected product missing this conversion factor (e.g. a legacy/imported row saved before
  // it became required on the product form) can never resolve totalUnits/unitCost here — no
  // amount of typing quantityPackages/packagePurchasePrice can substitute for it, so this is
  // surfaced as an explicit warning (see the message below the product field) rather than left as
  // a silently empty "--" the user has to guess the cause of.
  const hasValidUnitsPerPackage = !!unitsPerPackage && unitsPerPackage > 0;
  const totalUnits =
    hasValidUnitsPerPackage && form.quantityPackages ? Number(form.quantityPackages) * unitsPerPackage! : null;
  const unitCost =
    hasValidUnitsPerPackage && form.packagePurchasePrice
      ? Number(form.packagePurchasePrice) / unitsPerPackage!
      : null;
  const totalAmount =
    form.quantityPackages && form.packagePurchasePrice
      ? Number(form.quantityPackages) * Number(form.packagePurchasePrice)
      : null;
  const paidAmount = form.paidAmount ? Number(form.paidAmount) : 0;
  const outstandingToSupplier = totalAmount !== null ? totalAmount - paidAmount : null;

  function resetForm() {
    setEditingId(null);
    setSelectedProductId(null);
    setSearch('');
    setForm(emptyForm);
  }

  function startEdit(receipt: PurchaseReceipt) {
    setEditingId(receipt.id);
    setSelectedProductId(receipt.productId);
    setSearch('');
    setForm({
      receiptDate: receipt.receiptDate,
      warehouseId: receipt.warehouseId,
      branchId: receipt.branchId ?? '',
      supplierId: receipt.supplierId,
      quantityPackages: String(receipt.quantityPackages),
      packagePurchasePrice: String(receipt.packagePurchasePrice),
      packageSellingPrice: receipt.packageSellingPrice != null ? String(receipt.packageSellingPrice) : '',
      unitSellingPrice: receipt.unitSellingPrice != null ? String(receipt.unitSellingPrice) : '',
      paidAmount: String(receipt.paidAmount ?? 0),
      // Not persisted on the receipt row (see saveMutation) — there is no original value to
      // restore, so this always resets to the default and the required select forces a fresh,
      // explicit choice before the edit can be saved.
      paymentAccount: 'CASH',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function invalidateAfterSave() {
    queryClient.invalidateQueries({ queryKey: ['purchase-receipts'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    queryClient.invalidateQueries({ queryKey: ['treasury-cash-ledger'] });
    queryClient.invalidateQueries({ queryKey: ['stock-levels'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        receiptDate: form.receiptDate,
        productId: selectedProduct!.id,
        warehouseId: form.warehouseId,
        supplierId: form.supplierId,
        branchId: isPrintingPress ? form.branchId || undefined : undefined,
        quantityPackages: Number(form.quantityPackages),
        packagePurchasePrice: Number(form.packagePurchasePrice),
        packageSellingPrice: form.packageSellingPrice ? Number(form.packageSellingPrice) : undefined,
        unitSellingPrice: form.unitSellingPrice ? Number(form.unitSellingPrice) : undefined,
        paidAmount: paidAmount > 0 ? paidAmount : undefined,
        // Printing Press only: the user picks Cash Treasury vs. Bank Account explicitly (see the
        // form field below). Every other company keeps the prior fixed behavior — settled through
        // the bank account, with no cash-box option — since that was never user-selectable here.
        paymentAccount: paidAmount > 0 ? (isPrintingPress ? form.paymentAccount : 'BANK') : undefined,
      };
      return editingId
        ? apiClient.patch(`/inventory/purchase-receipts/${editingId}`, payload)
        : apiClient.post('/inventory/purchase-receipts', payload);
    },
    onSuccess: () => {
      invalidateAfterSave();
      const wasEditing = !!editingId;
      resetForm();
      toast.success(wasEditing ? t('common.updatedSuccessfully') : t('purchasing.receiptSavedSuccess'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('purchasing.receiptSaveFailed'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/inventory/purchase-receipts/${id}`),
    onSuccess: () => {
      invalidateAfterSave();
      toast.success(t('common.deletedSuccessfully'));
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? t('purchasing.receiptDeleteFailed'));
    },
  });

  async function handleDelete(receipt: PurchaseReceipt) {
    const ok = await confirm({ message: t('common.confirmDelete', { name: receipt.documentNumber }) });
    if (ok) deleteMutation.mutate(receipt.id);
  }

  const columns: Column<PurchaseReceipt>[] = [
    { header: t('table.documentNumber'), accessor: (r) => r.documentNumber },
    { header: t('common.date'), accessor: (r) => r.receiptDate },
    { header: t('fields.supplier'), accessor: (r) => r.supplier?.companyName ?? '—' },
    { header: t('fields.product'), accessor: (r) => r.product?.nameEn ?? '—' },
    {
      header: t('fields.quantityPackages'),
      accessor: (r) => `${formatAmount(r.quantityPackages)} × ${formatAmount(r.unitsPerPackage)}`,
      align: 'right',
    },
    {
      header: t('fields.totalAmount'),
      // quantityPackages × packagePurchasePrice — mirrors PurchaseReceiptsService.create()'s
      // totalAmount on the backend, so this column never has to recompute anything itself.
      accessor: (r) => formatAmount(r.totalAmount),
      align: 'right',
    },
    {
      header: t('fields.paidAmount'),
      accessor: (r) => formatAmount(r.paidAmount ?? 0),
      align: 'right',
    },
    {
      header: t('fields.remainingAmount'),
      accessor: (r) => formatAmount(r.totalAmount - (r.paidAmount ?? 0)),
      align: 'right',
    },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              startEdit(r);
            }}
          >
            ✏️
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(r);
            }}
          >
            🗑️
          </button>
        </div>
      ),
      align: 'center',
    },
  ];

  function handlePrint() {
    const previousTitle = document.title;
    document.title = t('purchasing.reportTitle');
    window.print();
    document.title = previousTitle;
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    // Toggled just before the html2canvas snapshot so the print-only header (normally
    // display:none on screen) renders into the capture — html2canvas reads the live DOM's
    // regular stylesheet, not @media print, so a plain class toggle is what actually shows it.
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      pdf.save(buildPdfFileName('فاتورة مشتريات', company?.nameAr || company?.nameEn, localToday()));
    } catch (err) {
      toast.error(t('purchasing.pdfExportError'));
      // eslint-disable-next-line no-console
      console.error('Purchasing receipts PDF export failed:', err);
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setPdfLoading(false);
    }
  }

  useImperativeHandle(ref, () => ({ print: handlePrint, downloadPdf: handleDownloadPdf }));

  return (
    <>
      <Card className="mb-4 print:hidden">
        <CardHeader>
          <CardTitle>{editingId ? t('purchasing.editReceipt') : t('purchasing.newReceipt')}</CardTitle>
        </CardHeader>

        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="col-span-2">
            <FormField label={t('fields.product')}>
              {selectedProduct ? (
                <div className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2">
                  <div className="text-sm">
                    <div className="font-medium text-[var(--text)]">{selectedProduct.nameEn}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {selectedProduct.sku ?? '—'} · {packageTypeName(selectedProduct.packageTypeId)} (
                      {selectedProduct.unitsPerPackage})
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-primary-600 hover:underline"
                    onClick={() => setSelectedProductId(null)}
                  >
                    {t('purchasing.changeItem')}
                  </button>
                </div>
              ) : null}
              {selectedProduct && !hasValidUnitsPerPackage && (
                <p className="mt-1 text-xs text-red-600">{t('purchasing.missingUnitsPerPackage')}</p>
              )}
              {!selectedProduct && (
                <div className="relative">
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t(
                      isPrintingPress
                        ? 'purchasing.searchProductPlaceholderPress'
                        : 'purchasing.searchProductPlaceholder',
                    )}
                  />
                  {searchResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-3 py-2 text-start text-sm hover:bg-[var(--surface-hover)]"
                          onClick={() => {
                            setSelectedProductId(p.id);
                            setSearch('');
                          }}
                        >
                          <div className="font-medium text-[var(--text)]">{p.nameEn}</div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {p.sku ?? '—'} {p.barcode ? `· ${p.barcode}` : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </FormField>
          </div>

          <FormField label={t('fields.supplier')}>
            <Select
              required
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">{t('actions.selectSupplier')}</option>
              {(suppliersQuery.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.companyName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('fields.receiptDate')}>
            <Input
              required
              type="date"
              value={form.receiptDate}
              onChange={(e) => setForm({ ...form, receiptDate: e.target.value })}
            />
          </FormField>
          {isPrintingPress && (
            <FormField label={t('fields.branch')}>
              <Select
                required
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value, warehouseId: '' })}
              >
                <option value="">{t('actions.selectBranch')}</option>
                {(branchesQuery.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nameAr || b.nameEn}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
          <FormField label={t('fields.warehouse')}>
            <Select
              required
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
            >
              <option value="">—</option>
              {filteredWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.nameAr || w.nameEn}
                </option>
              ))}
            </Select>
            {isPrintingPress && form.branchId && filteredWarehouses.length === 0 && (
              <p className="mt-1 text-xs text-red-600">{t('stockAudit.noWarehouseForBranch')}</p>
            )}
          </FormField>

          <FormField label={t('fields.quantityPackages')}>
            <Input
              required
              type="number"
              step="1"
              min="1"
              value={form.quantityPackages}
              onChange={(e) => setForm({ ...form, quantityPackages: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.totalUnits')}>
            <Input disabled value={totalUnits !== null ? totalUnits : ''} placeholder="—" />
          </FormField>

          <FormField label={t('fields.packagePurchasePrice')}>
            <Input
              required
              type="number"
              step="0.01"
              value={form.packagePurchasePrice}
              onChange={(e) => setForm({ ...form, packagePurchasePrice: e.target.value })}
            />
          </FormField>
          <FormField label={t('fields.unitCost')}>
            <Input disabled value={unitCost !== null ? unitCost.toFixed(4) : ''} placeholder="—" />
          </FormField>

          {!isPrintingPress && (
            <FormField label={t('purchasing.packageSellingPriceOptional')}>
              <Input
                type="number"
                step="0.01"
                value={form.packageSellingPrice}
                onChange={(e) => setForm({ ...form, packageSellingPrice: e.target.value })}
              />
            </FormField>
          )}
          {!isPrintingPress && (
            <FormField label={t('purchasing.unitSellingPriceOptional')}>
              <Input
                type="number"
                step="0.01"
                value={form.unitSellingPrice}
                onChange={(e) => setForm({ ...form, unitSellingPrice: e.target.value })}
              />
            </FormField>
          )}

          <div className="col-span-2">
            <FormField label={t('purchasing.paidAmountNow')}>
              <Input
                required
                type="number"
                step="0.01"
                min="0"
                max={totalAmount ?? undefined}
                value={form.paidAmount}
                onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
              />
            </FormField>
          </div>

          {isPrintingPress && paidAmount > 0 && (
            <div className="col-span-2">
              <FormField label={t('purchasing.paymentSource')}>
                <Select
                  required
                  value={form.paymentAccount}
                  onChange={(e) => setForm({ ...form, paymentAccount: e.target.value as 'CASH' | 'BANK' })}
                >
                  <option value="CASH">{t('treasury.paymentAccounts.CASH')}</option>
                  <option value="BANK">{t('treasury.paymentAccounts.BANK')}</option>
                </Select>
              </FormField>
            </div>
          )}

          {totalAmount !== null && (
            <div className="col-span-2 flex justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
              <span className="text-[var(--text-muted)]">{t('purchasing.outstandingToSupplier')}</span>
              <span className="font-medium text-[var(--text)]">{formatAmount(outstandingToSupplier)}</span>
            </div>
          )}

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            {editingId && (
              <Button type="button" variant="secondary" onClick={resetForm}>
                {t('common.cancel')}
              </Button>
            )}
            <Button
              type="submit"
              loading={saveMutation.isPending}
              disabled={
                !selectedProduct || !hasValidUnitsPerPackage || !form.warehouseId || (isPrintingPress && !form.branchId)
              }
            >
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex flex-wrap items-center gap-4">
            <CardTitle>{t('purchasing.recentReceipts')}</CardTitle>
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
            <div className="max-w-xs">
              <Input
                placeholder={t('purchasing.searchByTablePlaceholder')}
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--table-header-bg)] px-5 py-2.5 text-center shadow-sm">
            <div className="text-xs text-[var(--text-muted)]">{t('fields.totalPurchases')}</div>
            <div className="mt-1 text-lg font-semibold text-[var(--text)]">{formatAmount(totalFilteredPurchases)}</div>
          </div>
        </div>

        <div ref={printRef} className="purchasing-print">
          <div className="purchasing-print-header">
            <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
            <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{t('purchasing.reportTitle')}</div>
            <div style={{ fontSize: 11, color: '#4b5563' }}>
              {t('imports.printDate')}: {localToday()}
            </div>
          </div>
          <DataTable
            columns={columns}
            data={filteredReceipts}
            keyField={(r) => r.id}
            isLoading={receiptsQuery.isLoading}
            searchable={false}
          />
        </div>
      </Card>
    </>
  );
});

export function PurchasingPage() {
  const { t } = useTranslation();
  const tabRef = useRef<PurchasingTabHandle>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  return (
    <div>
      <PageHeader
        title={t('nav.purchasing')}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => tabRef.current?.print()}>
              {t('common.print')}
            </Button>
            <Button variant="secondary" onClick={() => tabRef.current?.downloadPdf()} disabled={pdfLoading}>
              {t('actions.downloadPdf')}
            </Button>
          </div>
        }
      />
      <PurchasingTab ref={tabRef} onPdfLoadingChange={setPdfLoading} />
    </div>
  );
}
