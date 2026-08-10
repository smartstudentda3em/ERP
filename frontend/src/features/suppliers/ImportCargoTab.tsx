import { forwardRef, MouseEvent, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';

type CargoStatus = 'ORDERED' | 'READY_FOR_SHIPPING' | 'SHIPPED';

interface Currency {
  id: string;
  code: string;
  nameEn: string;
  symbol?: string | null;
  isBaseCurrency?: boolean;
}

interface ExchangeRate {
  id: string;
  currencyId: string;
  rateToBase: number;
  effectiveDate: string;
}

/** Prices/currency shown in the Import/Goods section use the short symbol (falling back to the ISO
 * code when no symbol is set) instead of the long "code — name" form used elsewhere. */
function currencyLabel(c: Currency | null | undefined): string {
  if (!c) return '—';
  return c.symbol || c.code;
}

/** Latest known exchange rate from `from` currency into the local/base currency — 1 when they're
 * the same currency, null when it can't be determined (no base currency configured, or no rate on
 * file for a non-base currency). Also used to pre-fill the add/edit modal's "معامل التحويل" field
 * so it starts from the system's own rate instead of an empty box. */
function getRateToBase(
  from: Currency | null | undefined,
  base: Currency | null | undefined,
  rates: ExchangeRate[],
): number | null {
  if (!base) return null;
  if (!from || from.id === base.id) return 1;
  const rate = rates.find((r) => r.currencyId === from.id);
  return rate ? Number(rate.rateToBase) : null;
}

/** السعر بالعملة المحلية = سعر المورد × معامل التحويل — computed from the cargo line's OWN saved
 * conversionRate (never the system-wide exchange rate table, which is only used to pre-fill the
 * modal's suggested default). Always coerces to a number and falls back to a rate of 1 whenever
 * conversionRate is missing/blank/invalid, so this can never render NaN or "—". */
function localAmount(unitPrice: unknown, conversionRate: unknown): number {
  const price = Number(unitPrice);
  const rate = Number(conversionRate);
  const safeRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  return (Number.isFinite(price) ? price : 0) * safeRate;
}

/** Joins a product's SKU and name for display, quietly dropping whichever piece is missing
 * instead of rendering the literal word "undefined" when one of them isn't set. */
function productLabel(p: { sku?: string | null; nameEn?: string | null } | null | undefined): string {
  if (!p) return '—';
  const parts = [p.sku, p.nameEn].filter((v): v is string => !!v);
  return parts.length ? parts.join(' — ') : '—';
}

// Unicode "Left-to-Right Isolate" / "Pop Directional Isolate" — wrapping "amount + symbol" in
// these keeps that text laid out in its own true left-to-right order (e.g. "150.00 $") instead of
// the browser's bidi algorithm silently flipping it to "$ 150.00" just because the surrounding
// table cell's base direction is RTL.
const LRI = '⁦';
const PDI = '⁩';

/** Formats a currency amount for display inside RTL layouts, immune to bidi reordering. */
function money(amount: number, currency: Currency | null | undefined): string {
  return `${LRI}${formatAmount(amount)} ${currencyLabel(currency)}${PDI}`;
}

interface ProductOption {
  id: string;
  sku: string;
  nameEn: string;
}

interface SupplierOption {
  id: string;
  companyName: string;
  currencyId: string | null;
  currency: Currency | null;
}

interface ShipmentOption {
  id: string;
  shipmentName: string;
  /** Live sum of the shipment's expense lines — computed server-side, never a stored figure. */
  totalCost: number;
}

interface Company {
  id: string;
  nameAr?: string | null;
  nameEn?: string | null;
}

interface CargoItem {
  id: string;
  productId: string;
  product: ProductOption | null;
  supplierId: string;
  supplier: SupplierOption | null;
  shipmentId: string;
  shipment: ShipmentOption | null;
  quantity: number;
  unitPrice: number;
  currencyId: string | null;
  currency: Currency | null;
  conversionRate: number;
  localCurrencyId: string | null;
  localCurrency: Currency | null;
  specifications: string | null;
  orderDate: string;
  status: CargoStatus;
  notes: string | null;
}

const emptyForm = {
  productId: '',
  supplierId: '',
  shipmentId: '',
  quantity: '',
  unitPrice: '',
  conversionRate: '',
  localCurrencyId: '',
  specifications: '',
};

/** Print/PDF are triggered from SuppliersPage's unified top bar (opposite the "الاستيراد" title),
 * not from a button rendered inside this tab — so the parent needs a way to call into logic that
 * has to stay in here regardless, since it depends on `printRef` pointing at this tab's own DOM. */
export interface ImportCargoTabHandle {
  print: () => void;
  downloadPdf: () => Promise<void>;
}

interface ImportCargoTabProps {
  /** Lets the parent's "تحميل PDF" button (which lives outside this component) disable itself
   * for the duration of the export, since `pdfLoading` itself can't be read through a ref. */
  onPdfLoadingChange?: (loading: boolean) => void;
}

export const ImportCargoTab = forwardRef<ImportCargoTabHandle, ImportCargoTabProps>(function ImportCargoTab(
  { onPdfLoadingChange },
  ref,
) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const companyId = useAuthStore((s) => s.user?.companyId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const printRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Toggled true just before the html2canvas snapshot so screen-only chrome (search box, action
  // buttons) vanishes from both — mirrors the same pattern used on the invoice/statement pages.
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  useEffect(() => {
    onPdfLoadingChange?.(pdfLoading);
  }, [pdfLoading, onPdfLoadingChange]);

  const cargoQuery = useQuery({
    queryKey: ['import-cargo-items', companyId],
    queryFn: () => unwrap<CargoItem[]>(apiClient.get('/imports/cargo-items', { params: { companyId } })),
    enabled: !!companyId,
  });

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => unwrap<Company[]>(apiClient.get('/settings/companies')),
  });
  const company = companiesQuery.data?.find((c) => c.id === companyId) ?? companiesQuery.data?.[0];

  // Needed for the table's local-currency columns, so unlike the modal's dropdown data these are
  // fetched unconditionally rather than gated behind modalOpen.
  const allCurrenciesQuery = useQuery({
    queryKey: ['currencies'],
    queryFn: () => unwrap<Currency[]>(apiClient.get('/settings/currencies')),
  });

  const exchangeRatesQuery = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => unwrap<ExchangeRate[]>(apiClient.get('/settings/currencies/exchange-rates')),
  });

  const baseCurrency = useMemo(
    () => (allCurrenciesQuery.data ?? []).find((c) => c.isBaseCurrency) ?? null,
    [allCurrenciesQuery.data],
  );

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => unwrap<ProductOption[]>(apiClient.get('/inventory/products')),
    enabled: modalOpen,
  });

  const suppliersQuery = useQuery({
    queryKey: ['suppliers', companyId],
    queryFn: () => unwrap<SupplierOption[]>(apiClient.get('/suppliers', { params: { companyId } })),
    enabled: modalOpen && !!companyId,
  });

  // Needed for the table's تكلفة الشحن column (every row must divide into its shipment's total
  // cost), so — like the currency data above — this is fetched unconditionally rather than gated
  // behind modalOpen.
  const shipmentsQuery = useQuery({
    queryKey: ['shipments', companyId],
    queryFn: () => unwrap<ShipmentOption[]>(apiClient.get('/imports/shipments', { params: { companyId } })),
    enabled: !!companyId,
  });

  // إجمالي كمية الوحدات لكل شحنة — summed across every cargo line sharing that shipmentId, so the
  // shipment's total expenses can be spread per-unit and then multiplied back out per line below.
  const shipmentQuantityTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of cargoQuery.data ?? []) {
      totals.set(item.shipmentId, (totals.get(item.shipmentId) ?? 0) + Number(item.quantity ?? 0));
    }
    return totals;
  }, [cargoQuery.data]);

  /** تكلفة شحن الوحدة = إجمالي مصاريف الشحنة ÷ إجمالي كمية وحدات الشحنة — a per-unit rate, not
   * multiplied by this line's own quantity (that multiplication happens separately in السعر
   * الإجمالي). null when the shipment's total quantity is 0 (nothing to divide by) rather than a
   * misleading guess. */
  function shippingCostPerUnit(item: CargoItem): number | null {
    const totalQty = shipmentQuantityTotals.get(item.shipmentId) ?? 0;
    if (totalQty <= 0) return null;
    const shipment = (shipmentsQuery.data ?? []).find((s) => s.id === item.shipmentId);
    return Number(shipment?.totalCost ?? 0) / totalQty;
  }

  // Rolled ourselves instead of using DataTable's built-in search box, so it can be reliably hidden
  // for print/PDF (via print:hidden + isExportingPdf) the same way the rest of this toolbar is.
  const [cargoSearch, setCargoSearch] = useState('');
  const filteredCargo = useMemo(() => {
    const q = cargoSearch.trim().toLowerCase();
    if (!q) return cargoQuery.data ?? [];
    return (cargoQuery.data ?? []).filter(
      (r) =>
        productLabel(r.product).toLowerCase().includes(q) ||
        (r.supplier?.companyName ?? '').toLowerCase().includes(q) ||
        (r.shipment?.shipmentName ?? '').toLowerCase().includes(q),
    );
  }, [cargoQuery.data, cargoSearch]);

  // إجمالي مصاريف الشحن: sums each DISTINCT shipment's totalCost exactly once across whatever
  // rows are currently visible in the table (post-search-filter) — never per cargo line, since
  // totalCost is a shipment-level figure that would otherwise be double-counted whenever a
  // shipment has more than one cargo line.
  const visibleShippingExpensesTotal = useMemo(() => {
    const seenShipmentIds = new Set<string>();
    let total = 0;
    for (const item of filteredCargo) {
      if (!item.shipmentId || seenShipmentIds.has(item.shipmentId)) continue;
      seenShipmentIds.add(item.shipmentId);
      const shipment = (shipmentsQuery.data ?? []).find((s) => s.id === item.shipmentId);
      total += Number(shipment?.totalCost ?? 0);
    }
    return total;
  }, [filteredCargo, shipmentsQuery.data]);

  // إجمالي سعر الشحنة: live sum of every visible row's السعر الإجمالي column value — same formula
  // as that column's own accessor below, recomputed here so the card stays in sync automatically
  // whenever a cargo line is added, edited, or deleted (filteredCargo/shipmentQuantityTotals
  // change → this recomputes → no separate update path to keep in sync).
  const visibleTotalPriceSum = useMemo(() => {
    let total = 0;
    for (const item of filteredCargo) {
      const unit = localAmount(item.unitPrice, item.conversionRate);
      const shippingUnit = shippingCostPerUnit(item) ?? 0;
      total += (unit + shippingUnit) * Number(item.quantity ?? 0);
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredCargo, shipmentQuantityTotals, shipmentsQuery.data]);

  // إجمالي مصاريف الشحن should be denominated in whatever currency the table's own "تكلفة شحن
  // الوحدة"/"السعر الإجمالي" columns are actually showing (each row's localCurrency, same fallback
  // to baseCurrency those columns use) rather than always the system base currency — only falls
  // back to baseCurrency itself when the visible rows don't all agree on one local currency, since
  // there's no single correct unit to label a mixed-currency sum with.
  const visibleLocalCurrency = useMemo(() => {
    const currencies = new Map<string, Currency>();
    for (const item of filteredCargo) {
      const c = item.localCurrency ?? baseCurrency;
      if (c) currencies.set(c.id, c);
    }
    return currencies.size === 1 ? [...currencies.values()][0] : baseCurrency;
  }, [filteredCargo, baseCurrency]);

  // The report's printed/exported title becomes "ملف استيراد - [shipment name]" only when every
  // currently-visible row belongs to the same single shipment (typically because the search box
  // is being used to filter down to one) — otherwise it falls back to the generic multi-shipment
  // report title, since there's no single "current shipment" to name.
  const currentShipmentName = useMemo(() => {
    const names = new Set(
      filteredCargo.map((r) => r.shipment?.shipmentName).filter((n): n is string => !!n),
    );
    return names.size === 1 ? [...names][0] : null;
  }, [filteredCargo]);

  const printTitle = currentShipmentName
    ? `${t('imports.importFileTitle')} - ${currentShipmentName}`
    : t('imports.cargoReportTitle');

  const selectedSupplier = useMemo(
    () => (suppliersQuery.data ?? []).find((s) => s.id === form.supplierId) ?? null,
    [suppliersQuery.data, form.supplierId],
  );

  // العملة المحلية المختارة في النموذج — falls back to the system's base currency so the preview
  // still shows something sensible before the user has touched the new dropdown.
  const selectedLocalCurrency = useMemo(
    () => (allCurrenciesQuery.data ?? []).find((c) => c.id === form.localCurrencyId) ?? baseCurrency,
    [allCurrenciesQuery.data, form.localCurrencyId, baseCurrency],
  );

  // السعر بالعملة المحلية = سعر المورد × معامل التحويل — a live preview computed straight from the
  // two form fields; "—" only until a unit price is entered, defaulting the rate to 1 like the
  // saved value will, so the preview never disagrees with what actually gets stored.
  const localUnitPricePreview = form.unitPrice ? localAmount(form.unitPrice, form.conversionRate) : null;

  const isValid =
    !!form.productId && !!form.supplierId && !!form.shipmentId && !!form.quantity && !!form.unitPrice;

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        companyId,
        productId: form.productId,
        supplierId: form.supplierId,
        shipmentId: form.shipmentId,
        quantity: Number(form.quantity),
        unitPrice: Number(form.unitPrice),
        conversionRate: form.conversionRate ? Number(form.conversionRate) || 1 : 1,
        localCurrencyId: form.localCurrencyId || undefined,
        specifications: form.specifications || undefined,
      };
      return editingId
        ? apiClient.patch(`/imports/cargo-items/${editingId}`, payload)
        : apiClient.post('/imports/cargo-items', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['import-cargo-items'] });
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/imports/cargo-items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['import-cargo-items'] }),
  });

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, localCurrencyId: baseCurrency?.id ?? '' });
    setModalOpen(true);
  }

  function openEdit(row: CargoItem) {
    setEditingId(row.id);
    setForm({
      productId: row.productId,
      supplierId: row.supplierId,
      shipmentId: row.shipmentId,
      quantity: String(row.quantity),
      unitPrice: String(row.unitPrice),
      // Show what was actually saved on this line, not a freshly re-derived guess.
      conversionRate: String(row.conversionRate ?? 1),
      localCurrencyId: row.localCurrencyId ?? baseCurrency?.id ?? '',
      specifications: row.specifications ?? '',
    });
    setModalOpen(true);
  }

  async function handleDelete(e: MouseEvent, row: CargoItem) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.product?.nameEn ?? '' }) });
    if (ok) deleteMutation.mutate(row.id);
  }

  async function handleDownloadPdf() {
    if (!printRef.current) return;
    setPdfLoading(true);
    setIsExportingPdf(true);
    printRef.current.classList.add('pdf-export-mode');
    try {
      await new Promise(requestAnimationFrame);
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      // Landscape — this report has 8 data columns, wider than the portrait documents elsewhere.
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      pdf.save(buildPdfFileName('طلب استيراد', currentShipmentName, localToday()));
    } finally {
      printRef.current?.classList.remove('pdf-export-mode');
      setIsExportingPdf(false);
      setPdfLoading(false);
    }
  }

  // Browsers commonly default a print/save-as-PDF dialog's suggested filename to document.title,
  // so this is set to match the on-page print header for the duration of the print dialog (which
  // window.print() blocks on) and restored immediately after.
  function handlePrint() {
    const previousTitle = document.title;
    document.title = printTitle;
    window.print();
    document.title = previousTitle;
  }

  useImperativeHandle(ref, () => ({
    print: handlePrint,
    downloadPdf: handleDownloadPdf,
  }));

  const columns: Column<CargoItem>[] = [
    { header: t('imports.shipmentName'), accessor: (r) => r.shipment?.shipmentName ?? '—' },
    { header: t('fields.product'), accessor: (r) => productLabel(r.product) },
    { header: t('fields.supplier'), accessor: (r) => r.supplier?.companyName ?? '—' },
    { header: t('imports.quantity'), accessor: (r) => formatAmount(r.quantity), align: 'right' },
    {
      header: t('imports.supplierUnitPrice'),
      accessor: (r) => money(Number(r.unitPrice ?? 0), r.currency),
      align: 'right',
    },
    {
      header: t('imports.unitPriceLocal'),
      accessor: (r) => money(localAmount(r.unitPrice, r.conversionRate), r.localCurrency ?? baseCurrency),
      align: 'right',
    },
    {
      header: t('imports.unitShippingCost'),
      accessor: (r) => {
        const cost = shippingCostPerUnit(r);
        return cost === null ? '—' : money(cost, r.localCurrency ?? baseCurrency);
      },
      align: 'right',
    },
    {
      header: t('imports.totalPrice'),
      accessor: (r) => {
        const unit = localAmount(r.unitPrice, r.conversionRate);
        const shippingUnit = shippingCostPerUnit(r) ?? 0;
        return money((unit + shippingUnit) * Number(r.quantity ?? 0), r.localCurrency ?? baseCurrency);
      },
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
      <div ref={printRef} className="cargo-print-report">
        <div className="cargo-print-header">
          <div className="cargo-print-header-grid">
            <div className="cargo-print-header-side" aria-hidden="true" />
            <div className="cargo-print-header-center">
              <div style={{ fontSize: 16, fontWeight: 800 }}>{company?.nameAr || company?.nameEn || '—'}</div>
              <div style={{ fontSize: 13, fontWeight: 700, margin: '4px 0' }}>{printTitle}</div>
            </div>
            <div className="cargo-print-header-date">
              {t('imports.printDate')}: {localToday()}
            </div>
          </div>
        </div>

        <div className="cargo-print-summary">
          <span className="cargo-print-summary-badge">
            {t('imports.totalShippingExpenses')}: {money(visibleShippingExpensesTotal, visibleLocalCurrency)}
          </span>
          <span className="cargo-print-summary-badge">
            {t('imports.totalShipmentPrice')}: {money(visibleTotalPriceSum, visibleLocalCurrency)}
          </span>
        </div>

        {!isExportingPdf && (
          <div className="mb-3 grid grid-cols-3 items-center gap-3 print:hidden">
            <Input
              type="search"
              placeholder={t('common.search') ?? ''}
              className="max-w-xs justify-self-start"
              value={cargoSearch}
              onChange={(e) => setCargoSearch(e.target.value)}
            />
            {/* إجمالي مصاريف الشحن shifted toward the (RTL) right of this middle slot to make room
                beside it for إجمالي سعر الشحنة — both live totals now sit as a pair of cards.
                flex-nowrap on the pair (so the two cards themselves never stack onto two lines)
                plus whitespace-nowrap + a wider min-width/padding on each card keeps its own
                label+amount on one line even at the widest currency/amount combinations. */}
            <div className="flex flex-nowrap items-center justify-self-center gap-3">
              <div className="flex flex-row min-w-[200px] items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm">
                <span className="whitespace-nowrap text-[var(--text-muted)]">{t('imports.totalShippingExpenses')}</span>
                <span className="whitespace-nowrap font-semibold">{money(visibleShippingExpensesTotal, visibleLocalCurrency)}</span>
              </div>
              <div className="flex flex-row min-w-[200px] items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm">
                <span className="whitespace-nowrap text-[var(--text-muted)]">{t('imports.totalShipmentPrice')}</span>
                <span className="whitespace-nowrap font-semibold">{money(visibleTotalPriceSum, visibleLocalCurrency)}</span>
              </div>
            </div>
            <Button className="justify-self-end" onClick={openCreate}>
              + {t('common.create')}
            </Button>
          </div>
        )}

        <DataTable
          columns={columns}
          data={filteredCargo}
          keyField={(r) => r.id}
          isLoading={cargoQuery.isLoading}
          searchable={false}
          pageSize={500}
        />
      </div>

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
          <div className="col-span-2">
            <FormField label={t('fields.product')} required>
              <Select
                required
                value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })}
              >
                <option value="">{t('actions.selectProduct')}</option>
                {(productsQuery.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {productLabel(p)}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label={t('nav.suppliers')} required>
            <Select
              required
              value={form.supplierId}
              onChange={(e) => {
                const supplierId = e.target.value;
                const supplier = (suppliersQuery.data ?? []).find((s) => s.id === supplierId) ?? null;
                const rate = getRateToBase(supplier?.currency, baseCurrency, exchangeRatesQuery.data ?? []);
                setForm({ ...form, supplierId, conversionRate: rate !== null ? String(rate) : '' });
              }}
            >
              <option value="">{t('actions.selectSupplier')}</option>
              {(suppliersQuery.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.companyName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('imports.shipmentName')} required>
            <Select
              required
              value={form.shipmentId}
              onChange={(e) => setForm({ ...form, shipmentId: e.target.value })}
            >
              <option value="">—</option>
              {(shipmentsQuery.data ?? []).map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.shipmentName}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('imports.quantity')} required>
            <Input
              type="number"
              step="0.0001"
              min="0.0001"
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            />
          </FormField>
          <FormField label={t('imports.supplierUnitPrice')} required>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.0001"
                min="0"
                required
                value={form.unitPrice}
                onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
              />
              <span className="text-sm text-[var(--text-muted)]">{currencyLabel(selectedSupplier?.currency)}</span>
            </div>
          </FormField>
          <FormField label={t('imports.conversionRate')}>
            <Input
              type="number"
              step="0.000001"
              min="0"
              value={form.conversionRate}
              onChange={(e) => setForm({ ...form, conversionRate: e.target.value })}
            />
          </FormField>
          <FormField label={t('imports.localCurrency')}>
            <Select
              value={form.localCurrencyId}
              onChange={(e) => setForm({ ...form, localCurrencyId: e.target.value })}
            >
              <option value="">—</option>
              {(allCurrenciesQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {currencyLabel(c)} — {c.nameEn}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="col-span-2">
            <FormField label={t('imports.localUnitPrice')}>
              <Input
                disabled
                value={localUnitPricePreview === null ? '—' : money(localUnitPricePreview, selectedLocalCurrency)}
              />
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label={t('imports.specifications')}>
              <Input value={form.specifications} onChange={(e) => setForm({ ...form, specifications: e.target.value })} />
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
    </div>
  );
});
