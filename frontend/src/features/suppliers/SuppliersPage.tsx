import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { useActiveCompany, useIsPressManagerRestricted } from '../../lib/use-active-company';
import { SuppliersTab } from './SuppliersTab';
import { ImportCargoTab, ImportCargoTabHandle } from './ImportCargoTab';
import { ShippingTab } from './ShippingTab';
import { ShipmentPaymentsTab } from './ShipmentPaymentsTab';
import { PurchasingTab, PurchasingTabHandle } from '../purchasing/PurchasingPage';
import { ProductsTab, ProductsTabHandle } from '../inventory/ProductsPage';

type Tab = 'suppliers' | 'cargo' | 'shipping' | 'shipmentPayments' | 'products' | 'purchasing';

/**
 * The "الاستيراد" (Import) section: three tabs sharing one screen — Suppliers (who goods are
 * ordered from), Cargo (what's on order and its specs before shipping), and Shipping (how it's
 * getting here). Each tab owns its own "+ إضافة" action and CRUD state, since what "add" means
 * differs per tab (new supplier vs. new cargo line vs. new shipment).
 *
 * Printing Press restructures this section entirely into a disjoint tab set (every other company
 * keeps the three tabs above unchanged): "الموردون" (unchanged), "المواد الخام" (the standalone
 * Products screen, folded in as ProductsTab — see Sidebar.tsx's hideForPrintingPress on
 * '/inventory/products' and the RequireNotPrintingPress guard on that route in router.tsx), and
 * "فاتورة الشراء" (the standalone Purchasing page's form/table, folded in the same way for
 * '/purchasing'). Cargo/Shipping tracking has no use for this tenant, so both are dropped
 * entirely rather than relabeled.
 *
 * Print/PDF only apply to the Cargo tab (other companies) and the Purchase Invoice tab (Printing
 * Press), but sit in this shared top bar (opposite the page title, unlike a plain PageHeader)
 * rather than inside those tabs themselves — so they're driven through a ref into whichever one
 * is active.
 */
export function SuppliersPage() {
  const { t } = useTranslation();
  const { isPrintingPress, isLoading: isCompanyLoading } = useActiveCompany();
  // Manager-role users in the Press branch never see "فاتورة الشراء" at all — see
  // useIsPressManagerRestricted's own doc comment for the full restriction list this feeds.
  const purchasingTabRestricted = useIsPressManagerRestricted();
  const [searchParams, setSearchParams] = useSearchParams();
  // Lets a redirect (e.g. RequireNotPrintingPress on /inventory/stock, for Printing Press) land
  // directly on a specific sub-tab via ?tab=products instead of always defaulting to "الموردون".
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(
    initialTab === 'products' ||
      initialTab === 'purchasing' ||
      initialTab === 'cargo' ||
      initialTab === 'shipping' ||
      initialTab === 'shipmentPayments'
      ? initialTab
      : 'suppliers',
  );

  // Keeps the address bar in sync with which tab is showing (e.g. /suppliers?tab=purchasing for
  // the Purchase Invoice screen) — without this, switching tabs was pure component state with no
  // URL change at all, so the browser's address bar, back/forward, and refresh all stayed stuck
  // on a bare /suppliers regardless of which sub-screen was actually active.
  function selectTab(next: Tab) {
    setTab(next);
    setSearchParams(next === 'suppliers' ? {} : { tab: next }, { replace: true });
  }
  const cargoRef = useRef<ImportCargoTabHandle>(null);
  const [cargoPdfLoading, setCargoPdfLoading] = useState(false);
  const purchasingRef = useRef<PurchasingTabHandle>(null);
  const [purchasingPdfLoading, setPurchasingPdfLoading] = useState(false);
  const productsRef = useRef<ProductsTabHandle>(null);
  const [productsPdfLoading, setProductsPdfLoading] = useState(false);

  const tabs: { key: Tab; label: string }[] = isPrintingPress
    ? [
        { key: 'suppliers', label: t('nav.suppliers') },
        { key: 'products', label: t('imports.rawMaterialsTab') },
        ...(purchasingTabRestricted ? [] : [{ key: 'purchasing' as Tab, label: t('imports.purchaseInvoiceTab') }]),
      ]
    : [
        { key: 'suppliers', label: t('nav.suppliers') },
        { key: 'cargo', label: t('imports.cargoTab') },
        { key: 'shipping', label: t('imports.shippingTab') },
        { key: 'shipmentPayments', label: t('imports.shipmentPaymentsTab') },
      ];

  // Guards against a stale selection surviving a company switch (no full page reload) now that
  // 'shipping'/'cargo' and 'products'/'purchasing' each only exist for one side of the split.
  // Skipped while the companies list is still loading — isPrintingPress is falsy during that
  // window regardless of the real answer, and would otherwise wrongly reset a `?tab=products`
  // deep link (e.g. from RequireNotPrintingPress's /inventory/stock redirect) back to "suppliers"
  // before the true company is known.
  useEffect(() => {
    if (isCompanyLoading) return;
    if (isPrintingPress && (tab === 'shipping' || tab === 'cargo' || tab === 'shipmentPayments')) selectTab('suppliers');
    if (!isPrintingPress && (tab === 'products' || tab === 'purchasing')) selectTab('suppliers');
    // Bounces a restricted Manager off a stale ?tab=purchasing deep link (e.g. bookmarked before
    // their role/company changed) — the tab button itself is already absent from `tabs` above.
    if (purchasingTabRestricted && tab === 'purchasing') selectTab('suppliers');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrintingPress, isCompanyLoading, tab, purchasingTabRestricted]);

  const printHandle =
    tab === 'cargo' ? cargoRef : tab === 'purchasing' ? purchasingRef : tab === 'products' ? productsRef : null;
  const printPdfLoading =
    tab === 'cargo' ? cargoPdfLoading : tab === 'purchasing' ? purchasingPdfLoading : productsPdfLoading;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-xl font-semibold">{t(isPrintingPress ? 'nav.importsPress' : 'nav.imports')}</h1>
          <div className="import-nav-tabs flex gap-2 text-sm">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                className={`rounded-lg px-3 py-1.5 ${tab === tb.key ? 'bg-primary-600 text-white' : 'border border-[var(--border)]'}`}
                onClick={() => selectTab(tb.key)}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </div>

        {printHandle && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => printHandle.current?.print()}>
              {t('common.print')}
            </Button>
            <Button variant="secondary" onClick={() => printHandle.current?.downloadPdf()} disabled={printPdfLoading}>
              {t('actions.downloadPdf')}
            </Button>
          </div>
        )}
      </div>

      {tab === 'suppliers' && <SuppliersTab />}
      {tab === 'cargo' && <ImportCargoTab ref={cargoRef} onPdfLoadingChange={setCargoPdfLoading} />}
      {tab === 'shipping' && <ShippingTab />}
      {tab === 'shipmentPayments' && <ShipmentPaymentsTab />}
      {tab === 'products' && <ProductsTab ref={productsRef} onPdfLoadingChange={setProductsPdfLoading} />}
      {tab === 'purchasing' && !purchasingTabRestricted && (
        <PurchasingTab ref={purchasingRef} onPdfLoadingChange={setPurchasingPdfLoading} />
      )}
    </div>
  );
}
