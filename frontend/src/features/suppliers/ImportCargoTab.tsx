import { forwardRef, MouseEvent, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '../../lib/api-client';
import { formatAmount } from '../../lib/number-format';
import { useAuthStore } from '../../store/auth-store';
import { useActiveCompany, STATIONERY_COMPANY_CODE, AIR_CONDITIONING_COMPANY_CODE } from '../../lib/use-active-company';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input, FormField } from '../../components/ui/Input';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { DataTable, Column } from '../../components/ui/DataTable';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { localToday } from '../../lib/date-utils';
import { buildPdfFileName } from '../../lib/pdf-filename';
import { exportElementToPdf } from '../../lib/pdf-export';

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
  shipmentDate: string | null;
  shippingCompanyName: string;
  /** Live sum of the shipment's expense lines — computed server-side, never a stored figure. */
  totalCost: number;
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

const emptyShipmentForm = {
  shipmentName: '',
  shipmentDate: '',
  shippingCompanyName: '',
};

/** "العملة المحلية" is pinned per company on this screen (not user-selectable) to keep every cargo
 * line's local-currency figures consistent — القرطاسية always reports in KWD, التكييفات always in
 * EGP. Matches the KWD/EGP currency rows seeded per-company in run-seed.ts. */
const FIXED_LOCAL_CURRENCY_CODE_BY_COMPANY: Record<string, string> = {
  [STATIONERY_COMPANY_CODE]: 'KWD',
  [AIR_CONDITIONING_COMPANY_CODE]: 'EGP',
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
  /** The parent's print/PDF buttons only make sense while a specific shipment's cargo is open
   * (the master shipment list has nothing to export) — this lets SuppliersPage's shared top bar
   * hide them while this tab is showing the master view. */
  onDetailViewChange?: (inDetailView: boolean) => void;
}

export const ImportCargoTab = forwardRef<ImportCargoTabHandle, ImportCargoTabProps>(function ImportCargoTab(
  { onPdfLoadingChange, onDetailViewChange },
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

  // null = master view (shipment list). Set = detail view, scoped to one shipment's cargo items.
  // Resets to null whenever this tab remounts (SuppliersPage renders it conditionally on the outer
  // tab switch), which is an acceptable, simple default rather than persisting to the URL.
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const [editingShipmentId, setEditingShipmentId] = useState<string | null>(null);
  const [shipmentForm, setShipmentForm] = useState(emptyShipmentForm);
  // Row click on the cargo table opens a read-only details view for that one line — separate from
  // openEdit()'s modal, which stays reserved for the explicit "تعديل" action.
  const [detailItem, setDetailItem] = useState<CargoItem | null>(null);

  useEffect(() => {
    onPdfLoadingChange?.(pdfLoading);
  }, [pdfLoading, onPdfLoadingChange]);

  useEffect(() => {
    onDetailViewChange?.(selectedShipmentId !== null);
  }, [selectedShipmentId, onDetailViewChange]);

  const cargoQuery = useQuery({
    queryKey: ['import-cargo-items', companyId],
    queryFn: () => unwrap<CargoItem[]>(apiClient.get('/imports/cargo-items', { params: { companyId } })),
    enabled: !!companyId,
  });

  // /auth/my-companies (not the settings.company.view-gated /settings/companies) — same reasoning
  // as every other Press/AC/STAT-conditional screen in this codebase, so this never silently 403s
  // for a role that lacks Settings access.
  const { company } = useActiveCompany();

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

  // The active company's pinned "العملة المحلية" row (KWD for القرطاسية, EGP للتكييفات) — looked
  // up by code rather than assumed by position, so it resolves correctly regardless of the
  // company's own currency list ordering. null only while still loading or for a company this
  // screen isn't scoped to (this tab itself only renders for STAT/AC — see SuppliersPage.tsx).
  const fixedLocalCurrencyCode = company?.code ? FIXED_LOCAL_CURRENCY_CODE_BY_COMPANY[company.code] : undefined;
  const fixedLocalCurrency = useMemo(
    () => (allCurrenciesQuery.data ?? []).find((c) => c.code === fixedLocalCurrencyCode) ?? null,
    [allCurrenciesQuery.data, fixedLocalCurrencyCode],
  );

  // The header totals (إجمالي مصاريف الشحن / إجمالي سعر الشحنة) always report in the company's own
  // pinned currency — never derived from whatever the visible cargo rows happen to carry, so an
  // empty or mixed-currency shipment still shows KD/EGP instead of silently falling back to the
  // system base currency (e.g. USD).
  const headerTotalsCurrency = fixedLocalCurrency ?? baseCurrency;

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

  const selectedShipment = useMemo(
    () => (shipmentsQuery.data ?? []).find((s) => s.id === selectedShipmentId) ?? null,
    [shipmentsQuery.data, selectedShipmentId],
  );

  // تعديل/حذف on the master shipment list reuse the exact same /imports/shipments endpoints
  // ShippingTab.tsx's own CRUD calls — this tab just offers a second entry point into them so a
  // shipment can be corrected without leaving the "البضاعة" tab.
  const saveShipmentMutation = useMutation({
    mutationFn: () => {
      const payload = {
        companyId,
        shipmentName: shipmentForm.shipmentName,
        shipmentDate: shipmentForm.shipmentDate || undefined,
        shippingCompanyName: shipmentForm.shippingCompanyName,
      };
      return editingShipmentId
        ? apiClient.patch(`/imports/shipments/${editingShipmentId}`, payload)
        : apiClient.post('/imports/shipments', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setShipmentModalOpen(false);
      setEditingShipmentId(null);
      setShipmentForm(emptyShipmentForm);
    },
  });

  const deleteShipmentMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/imports/shipments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shipments'] }),
  });

  function openEditShipment(e: MouseEvent, row: ShipmentOption) {
    e.stopPropagation();
    setEditingShipmentId(row.id);
    setShipmentForm({
      shipmentName: row.shipmentName,
      shipmentDate: row.shipmentDate ?? '',
      shippingCompanyName: row.shippingCompanyName,
    });
    setShipmentModalOpen(true);
  }

  async function handleDeleteShipment(e: MouseEvent, row: ShipmentOption) {
    e.stopPropagation();
    const ok = await confirm({ message: t('common.confirmDelete', { name: row.shipmentName }) });
    if (ok) deleteShipmentMutation.mutate(row.id);
  }

  const shipmentColumns: Column<ShipmentOption>[] = [
    { header: t('imports.shipmentName'), accessor: (r) => r.shipmentName },
    { header: t('imports.shipmentDate'), accessor: (r) => r.shipmentDate ?? '—' },
    { header: t('imports.shippingCompany'), accessor: (r) => r.shippingCompanyName },
    { header: t('imports.totalShipmentExpenses'), accessor: (r) => formatAmount(r.totalCost), align: 'right' },
    {
      header: t('common.actions'),
      accessor: (r) => (
        <div className="flex justify-center gap-3">
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedShipmentId(r.id);
            }}
          >
            {t('imports.viewManageCargo')}
          </button>
          <button type="button" className="text-primary-600 hover:underline" onClick={(e) => openEditShipment(e, r)}>
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="text-red-600 hover:underline"
            disabled={deleteShipmentMutation.isPending}
            onClick={(e) => handleDeleteShipment(e, r)}
          >
            {t('common.delete')}
          </button>
        </div>
      ),
      align: 'center',
    },
  ];

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
    // Detail view only ever shows the currently open shipment's own lines — applied before the
    // text search below so search only ever narrows within that shipment, never across others.
    const scoped = (cargoQuery.data ?? []).filter((r) => r.shipmentId === selectedShipmentId);
    // Multi-keyword, cross-column, order-independent — see DataTable.tsx's own search for the
    // same pattern.
    const keywords = cargoSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (keywords.length === 0) return scoped;
    return scoped.filter((r) => {
      const haystack = [productLabel(r.product), r.supplier?.companyName, r.shipment?.shipmentName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return keywords.every((kw) => haystack.includes(kw));
    });
  }, [cargoQuery.data, cargoSearch, selectedShipmentId]);

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

  // إجمالي عدد الوحدات: plain sum of the الكمية column across whatever rows are currently visible
  // (post-search-filter) — recomputes automatically whenever filteredCargo changes, same pattern as
  // the shipping-expenses/total-price cards below rather than a separately-tracked counter.
  const visibleTotalQuantity = useMemo(
    () => filteredCargo.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    [filteredCargo],
  );

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

  // Combined "sku — name" / "company — currency" labels so the searchable dropdowns below show
  // enough context to disambiguate a match without opening it, matching productLabel()'s existing
  // convention rather than introducing a separate two-column option layout.
  const productOptions = useMemo(
    () => (productsQuery.data ?? []).map((p) => ({ value: p.id, label: productLabel(p) })),
    [productsQuery.data],
  );

  const supplierOptions = useMemo(
    () =>
      (suppliersQuery.data ?? []).map((s) => ({
        value: s.id,
        label: s.currency ? `${s.companyName} — ${currencyLabel(s.currency)}` : s.companyName,
      })),
    [suppliersQuery.data],
  );

  // العملة المحلية المختارة في النموذج — falls back to the system's base currency so the preview
  // still shows something sensible before the user has touched the new dropdown.
  const selectedLocalCurrency = useMemo(
    () => fixedLocalCurrency ?? (allCurrenciesQuery.data ?? []).find((c) => c.id === form.localCurrencyId) ?? baseCurrency,
    [fixedLocalCurrency, allCurrenciesQuery.data, form.localCurrencyId, baseCurrency],
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
    setForm({
      ...emptyForm,
      // Programmatically bound to whichever shipment's detail view is open — the "اسم الشحنة"
      // field is no longer shown in this modal at all, see the master/detail render below.
      shipmentId: selectedShipmentId ?? '',
      localCurrencyId: fixedLocalCurrency?.id ?? baseCurrency?.id ?? '',
    });
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
      // العملة المحلية is pinned per company (not user-editable — see the disabled field below), so
      // re-saving an older line here also normalizes it onto the company's fixed currency instead
      // of preserving whatever it happened to be saved with before this was locked down.
      localCurrencyId: fixedLocalCurrency?.id ?? row.localCurrencyId ?? baseCurrency?.id ?? '',
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
      // Portrait, matching the other printable documents in the app — the column widths below
      // (and the print CSS's wrap/break-word rules) are tuned to fit this report's 7 visible
      // columns into A4 portrait instead of relying on landscape's extra width.
      await exportElementToPdf(
        printRef.current,
        buildPdfFileName('طلب استيراد', currentShipmentName, localToday()),
        'portrait',
      );
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
    // No "اسم الشحنة" column here — every row in this view already belongs to the one shipment
    // named in the detail header above, see the master/detail render below.
    {
      header: t('fields.product'),
      accessor: (r) => <bdi dir="ltr">{productLabel(r.product)}</bdi>,
      width: '30%',
    },
    {
      header: t('imports.quantity'),
      accessor: (r) => formatAmount(r.quantity),
      align: 'right',
      highlight: true,
      width: '1%',
    },
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
      // السعر النهائي للوحدة = سعر الوحدة (بالعملة المحلية) + تكلفة الشحن للوحدة.
      header: t('imports.finalPrice'),
      accessor: (r) => {
        const unit = localAmount(r.unitPrice, r.conversionRate);
        const shippingUnit = shippingCostPerUnit(r) ?? 0;
        return money(unit + shippingUnit, r.localCurrency ?? baseCurrency);
      },
      align: 'right',
      highlight: true,
      // Narrowed to match the other price columns' natural (unset) width instead of being left to
      // soak up whatever extra table width the auto layout algorithm would otherwise hand it.
      width: '9%',
    },
    {
      // السعر الإجمالي = (سعر الوحدة + تكلفة الشحن) × الكمية.
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

  // Master view — the shipment list this tab now opens on. Detail view (below) only renders once
  // a shipment is picked from here.
  if (selectedShipmentId === null) {
    return (
      <div>
        <DataTable
          columns={shipmentColumns}
          data={shipmentsQuery.data ?? []}
          keyField={(r) => r.id}
          isLoading={shipmentsQuery.isLoading}
          onRowClick={(r) => setSelectedShipmentId(r.id)}
        />

        <Modal
          open={shipmentModalOpen}
          onClose={() => {
            setShipmentModalOpen(false);
            setEditingShipmentId(null);
          }}
          title={t('common.edit')}
        >
          <form
            className="grid grid-cols-1 gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveShipmentMutation.mutate();
            }}
          >
            <FormField label={t('imports.shipmentName')}>
              <Input
                required
                value={shipmentForm.shipmentName}
                onChange={(e) => setShipmentForm({ ...shipmentForm, shipmentName: e.target.value })}
              />
            </FormField>
            <FormField label={t('imports.shipmentDate')}>
              <Input
                type="date"
                value={shipmentForm.shipmentDate}
                onChange={(e) => setShipmentForm({ ...shipmentForm, shipmentDate: e.target.value })}
              />
            </FormField>
            <FormField label={t('imports.shippingCompany')}>
              <Input
                required
                value={shipmentForm.shippingCompanyName}
                onChange={(e) => setShipmentForm({ ...shipmentForm, shippingCompanyName: e.target.value })}
              />
            </FormField>
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShipmentModalOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={saveShipmentMutation.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div>
      {/* Search sits on the same row as the back link/shipment title — flex + justify-between
          keeps them cleanly opposite each other regardless of viewport width. */}
      <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-primary-600 hover:underline"
            onClick={() => {
              setSelectedShipmentId(null);
              setCargoSearch('');
            }}
          >
            {t('imports.backToShipments')}
          </button>
          <span className="text-[var(--text-muted)]">
            {t('imports.shipmentHeading')}: <strong className="text-[var(--text)]">{selectedShipment?.shipmentName ?? '—'}</strong>
          </span>
        </div>
        <Input
          type="search"
          placeholder={t('common.search') ?? ''}
          className="max-w-xs"
          value={cargoSearch}
          onChange={(e) => setCargoSearch(e.target.value)}
        />
      </div>

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
            {t('imports.totalShippingExpenses')}: {money(visibleShippingExpensesTotal, headerTotalsCurrency)}
          </span>
          <span className="cargo-print-summary-badge">
            {t('imports.totalUnits')}: {formatAmount(visibleTotalQuantity)}
          </span>
          <span className="cargo-print-summary-badge">
            {t('imports.totalShipmentPrice')}: {money(visibleTotalPriceSum, headerTotalsCurrency)}
          </span>
        </div>

        {!isExportingPdf && (
          <>
            {/* The three totals are the row's only content now that search has moved up to the
                title row, so a plain centered flex row (no absolute-positioning trick needed)
                already gives equal left/right margins. flex-nowrap (so the row never stacks onto
                multiple lines) plus whitespace-nowrap + a wider min-width/padding on each card
                keeps its own label+amount on one line even at the widest currency/amount
                combinations. */}
            <div className="mb-3 flex flex-nowrap items-center justify-center gap-3 print:hidden">
              <div className="flex flex-row min-w-[200px] items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm">
                <span className="whitespace-nowrap text-[var(--text-muted)]">{t('imports.totalShippingExpenses')}</span>
                <span className="whitespace-nowrap font-semibold">{money(visibleShippingExpensesTotal, headerTotalsCurrency)}</span>
              </div>
              <div className="flex flex-row min-w-[160px] items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm">
                <span className="whitespace-nowrap text-[var(--text-muted)]">{t('imports.totalUnits')}</span>
                <span className="whitespace-nowrap font-semibold">{formatAmount(visibleTotalQuantity)}</span>
              </div>
              <div className="flex flex-row min-w-[200px] items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm">
                <span className="whitespace-nowrap text-[var(--text-muted)]">{t('imports.totalShipmentPrice')}</span>
                <span className="whitespace-nowrap font-semibold">{money(visibleTotalPriceSum, headerTotalsCurrency)}</span>
              </div>
            </div>
            <div className="mb-3 flex justify-end print:hidden">
              <Button onClick={openCreate}>
                + {t('common.create')}
              </Button>
            </div>
          </>
        )}

        <DataTable
          columns={columns}
          data={filteredCargo}
          keyField={(r) => r.id}
          isLoading={cargoQuery.isLoading}
          searchable={false}
          pageSize={500}
          onRowClick={(r) => setDetailItem(r)}
        />
      </div>

      <Modal open={!!detailItem} onClose={() => setDetailItem(null)} title={t('imports.itemDetails')}>
        {detailItem && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              [t('fields.product'), productLabel(detailItem.product)],
              [t('imports.itemDescription'), detailItem.product?.nameEn ?? '—'],
              [t('imports.quantity'), formatAmount(detailItem.quantity)],
              [t('fields.supplier'), detailItem.supplier?.companyName ?? '—'],
              [t('imports.supplierUnitPrice'), money(Number(detailItem.unitPrice ?? 0), detailItem.currency)],
              [t('fields.currency'), currencyLabel(detailItem.currency)],
              [
                t('imports.unitShippingCost'),
                (() => {
                  const cost = shippingCostPerUnit(detailItem);
                  return cost === null ? '—' : money(cost, detailItem.localCurrency ?? baseCurrency);
                })(),
              ],
              [
                t('imports.totalPrice'),
                (() => {
                  const unit = localAmount(detailItem.unitPrice, detailItem.conversionRate);
                  const shippingUnit = shippingCostPerUnit(detailItem) ?? 0;
                  return money((unit + shippingUnit) * Number(detailItem.quantity ?? 0), detailItem.localCurrency ?? baseCurrency);
                })(),
              ],
              [t('imports.shipmentName'), detailItem.shipment?.shipmentName ?? '—'],
              [t('imports.conversionRate'), formatAmount(detailItem.conversionRate ?? 1)],
              [t('imports.specifications'), detailItem.specifications || '—'],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="text-[var(--text-muted)]">{label}</div>
                <div className="font-medium">{value}</div>
              </div>
            ))}
            <div className="col-span-2 mt-2 flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setDetailItem(null)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
              <SearchableSelect
                required
                options={productOptions}
                value={form.productId}
                onChange={(productId) => setForm({ ...form, productId })}
                placeholder={t('actions.selectProduct') ?? ''}
              />
            </FormField>
          </div>
          <FormField label={t('nav.suppliers')} required>
            <SearchableSelect
              required
              options={supplierOptions}
              value={form.supplierId}
              onChange={(supplierId) => {
                const supplier = (suppliersQuery.data ?? []).find((s) => s.id === supplierId) ?? null;
                const rate = getRateToBase(supplier?.currency, baseCurrency, exchangeRatesQuery.data ?? []);
                setForm({ ...form, supplierId, conversionRate: rate !== null ? String(rate) : '' });
              }}
              placeholder={t('actions.selectSupplier') ?? ''}
            />
          </FormField>
          {/* No "اسم الشحنة" field here — this modal only ever opens from inside one shipment's
              detail view, so form.shipmentId is bound programmatically to selectedShipmentId in
              openCreate()/openEdit() above rather than picked here. */}
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
            {/* Pinned per company (KWD for القرطاسية, EGP للتكييفات) rather than user-selectable —
                a free-choice dropdown here was the exact source of the mixed-currency inconsistency
                this field now exists to prevent, so it's shown read-only like the price previews
                below it instead of as an interactive control. */}
            <Input disabled value={fixedLocalCurrency ? `${currencyLabel(fixedLocalCurrency)} — ${fixedLocalCurrency.nameEn}` : '—'} />
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
