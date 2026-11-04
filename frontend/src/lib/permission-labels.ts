// Arabic names for the permission editor (UserPermissionsModal). The permission catalog itself comes
// from the server; this only decides how its modules are grouped into sections and what they're called.
// A module the map doesn't know yet still shows up — under "أخرى", by its raw code — so a newly added
// permission can never be silently missing from the editor.

export interface PermissionSection {
  key: string;
  title: string;
  modules: Record<string, string>;
}

export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    key: 'invoices',
    title: 'الفواتير والمبيعات',
    modules: {
      'sales.invoice': 'فواتير البيع',
      'sales.payment': 'المقبوضات',
      'sales.paymentList': 'شاشة المقبوضات',
      'sales.quotation': 'عروض الأسعار',
      'sales.order': 'أوامر البيع',
      'sales.installmentPlan': 'التقسيط',
      'sales.guidelinePrice': 'الأسعار الاسترشادية',
    },
  },
  {
    key: 'inventory',
    title: 'المخزون والمنتجات',
    modules: {
      'inventory.product': 'المنتجات والأصناف',
      'inventory.stock': 'أرصدة المخازن والكميات',
      'inventory.stockAudit': 'الجرد',
      'inventory.purchaseReceipt': 'فواتير الشراء',
      'settings.warehouse': 'المخازن',
    },
  },
  {
    key: 'treasury',
    title: 'الخزينة والمالية',
    modules: {
      'treasury.cash-box': 'حركة الخزينة',
      'treasury.expense': 'المصروفات',
      'accounting.reports': 'التقارير المالية',
      partners: 'الشركاء',
      'settings.partner': 'نسب الشركاء',
    },
  },
  {
    key: 'parties',
    title: 'العملاء والموردين',
    modules: {
      customers: 'العملاء',
      suppliers: 'الموردون',
      'suppliers.payment': 'دفعات الموردين',
      'imports.cargo': 'بضاعة الشحنات',
      'imports.shipment': 'الشحنات',
      'imports.shipmentPayment': 'دفعات الشحنات',
      'imports.shippingExpenseType': 'أنواع مصروفات الشحن',
    },
  },
  {
    key: 'reps',
    title: 'المناديب والعمولات',
    modules: {
      'sales-representatives': 'مدراء الأفرع والمناديب',
      'sales-representatives.myDashboard': 'لوحة المدير الشخصية',
    },
  },
  {
    key: 'hr',
    title: 'الموظفون والمرتبات',
    modules: {
      'hr.employee': 'الموظفون',
      'hr.payroll': 'المرتبات',
    },
  },
  {
    key: 'users',
    title: 'المستخدمون والأدوار',
    modules: {
      users: 'المستخدمون',
      roles: 'الأدوار',
    },
  },
  {
    key: 'settings',
    title: 'الإعدادات والنظام',
    modules: {
      'settings.company': 'الشركات',
      'settings.branch': 'الفروع',
      'settings.currency': 'العملات',
      'settings.tax': 'الضرائب',
      'settings.fiscal-year': 'السنوات المالية',
      'settings.numbering-series': 'سلاسل الترقيم',
      'settings.product-category': 'فئات المنتجات',
      'settings.brand': 'العلامات التجارية',
      'settings.unit': 'الوحدات',
      'settings.packageType': 'أنواع العبوات',
      'settings.expenseCategory': 'فئات المصروفات',
      'admin.backup': 'النسخ الاحتياطي',
      dashboard: 'لوحة التحكم',
      notifications: 'الإشعارات',
    },
  },
];

export const ACTION_LABELS: Record<string, string> = {
  view: 'عرض',
  create: 'إنشاء / إضافة',
  edit: 'تعديل',
  delete: 'حذف',
  print: 'طباعة',
  export: 'تصدير',
  approve: 'اعتماد',
  cancel: 'إلغاء',
  sellBelowCost: 'البيع بأقل من التكلفة',
};

export interface CatalogEntry {
  module: string;
  action: string;
  code: string;
}

export interface GroupedSection {
  key: string;
  title: string;
  modules: { module: string; label: string; entries: CatalogEntry[] }[];
}

/** Groups the server's flat permission list into the editor's sections, in a stable display order. */
export function groupCatalog(catalog: CatalogEntry[]): GroupedSection[] {
  const byModule = new Map<string, CatalogEntry[]>();
  for (const e of catalog) {
    if (!byModule.has(e.module)) byModule.set(e.module, []);
    byModule.get(e.module)!.push(e);
  }
  const known = new Set<string>();
  const sections: GroupedSection[] = PERMISSION_SECTIONS.map((s) => {
    const modules = Object.entries(s.modules)
      .filter(([m]) => byModule.has(m))
      .map(([m, label]) => {
        known.add(m);
        return { module: m, label, entries: byModule.get(m)! };
      });
    return { key: s.key, title: s.title, modules };
  }).filter((s) => s.modules.length);

  const others = [...byModule.keys()].filter((m) => !known.has(m));
  if (others.length) {
    sections.push({
      key: 'other',
      title: 'أخرى',
      modules: others.map((m) => ({ module: m, label: m, entries: byModule.get(m)! })),
    });
  }
  return sections;
}
