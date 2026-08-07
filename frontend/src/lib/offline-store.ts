/**
 * Local, browser-only stand-in for the real backend.
 *
 * When there is no NestJS API reachable (no Docker/Postgres set up), every request the app
 * makes would otherwise fail. Rather than leave every page broken, api-client.ts falls back to
 * this module on request failure: it emulates the handful of REST endpoints the frontend calls,
 * persisting everything in localStorage so data survives a page reload.
 *
 * This is intentionally simple (no auth, no real validation, loose typing) — it exists purely so
 * the UI has something to read and write while a real backend isn't available. Once a real
 * backend responds successfully, this code is never consulted.
 */

/**
 * Three fully independent companies share this one system — mirrors the real backend's
 * run-seed.ts COMPANY_DEFS exactly (same codes/names), so the offline demo and a real deployment
 * present the same starting point. `OFFLINE_COMPANY_ID` stays exported as the first company's id
 * (STAT) for backward compatibility with call sites that pre-date multi-company support.
 */
const OFFLINE_COMPANY_DEFS = [
  { id: 'offline-company', code: 'STAT', nameEn: 'Stationery & Printing Supplies', nameAr: 'القرطاسية ومستلزمات الطباعة' },
  { id: 'offline-company-ac', code: 'AC', nameEn: 'Air Conditioning', nameAr: 'التكييفات' },
  { id: 'offline-company-press', code: 'PRESS', nameEn: 'Printing Press', nameAr: 'المطبعة' },
];
export const OFFLINE_COMPANY_ID = OFFLINE_COMPANY_DEFS[0].id;
export const OFFLINE_BRANCH_ID = 'offline-branch';

/** Mirrors SalesRepresentativesService.assertBranchRequiredForPress() on the real backend: the
 * Printing Press branch manager record is meaningless without a branch — every other company
 * keeps the field optional. */
function assertBranchRequiredForPress(companyId: string, branchId?: string | null): void {
  const company = OFFLINE_COMPANY_DEFS.find((c) => c.id === companyId);
  if (company?.code === 'PRESS' && !branchId) {
    throw new OfflineApiError('يجب تحديد الفرع');
  }
}

/** Mirrors LoginPage.tsx's OFFLINE_DEMO_PASSWORD — this mock never stores real per-user
 * passwords, so every offline account (including the seeded admin) shares this one login
 * password. Independent of Factory Reset's fixed reset code (see the 'system/factory-reset'
 * route below) — changing this never affects that. */
const OFFLINE_DEMO_PASSWORD = 'Ayman987654#';

/** Mirrors LoginPage.tsx's ADMIN_EMAIL and run-seed.ts's default admin identity. */
const OFFLINE_ADMIN_EMAIL = 'aymanmakroum83@gmail.com';
const OFFLINE_ADMIN_FULL_NAME = 'أيمن مكرم';
const OFFLINE_ADMIN_PHONE = '99970766';

/**
 * Mirrors the Manager role ("مدير فرع" / Branch Manager) permission set seeded in
 * backend/src/database/seeds/run-seed.ts — widened per the Printing Press branch spec: full
 * Dashboard access; Purchasing (suppliers, products/raw-materials, purchase receipts) capped at
 * view+create only (inventory.product is shared by the raw-materials screen and the Press-only
 * sellable-products catalog, so this one grant covers both); Sales (quotations/invoices/payments),
 * Treasury expenses, and Payroll get full management; hr.employee.view is a technical prerequisite
 * only (PayrollPage's "new run" flow reads GET /hr/employees), not employee CRUD; Financial
 * Reports and treasury cash-box tracking stay view-only; Monthly Stock Audit gets view+create
 * ("conduct and record") but never approve (Administrator-only); Settings gets full management
 * except settings.partner (Partners/percentages) and system (factory reset, already gated by
 * isSuperAdmin regardless of permissions — see SettingsPage.tsx's canFactoryReset).
 * `sales-representatives.view` is kept so the Manager's own "مدراء الفروع" sidebar entry stays
 * visible. The actual branch scoping of what this role can see/do comes from
 * resolveOfflineBranchId() (mirrors SalesRepAccessService.resolveBranchId()), keyed off the
 * SalesRepresentative row an admin links to this user via that same مدراء الفروع screen.
 */
const MANAGER_PERMISSION_CODES = [
  'dashboard.view',
  // Purchasing — view + create only, no edit/delete
  'suppliers.view',
  'suppliers.create',
  'inventory.product.view',
  'inventory.product.create',
  'inventory.purchaseReceipt.view',
  'inventory.purchaseReceipt.create',
  // Sales — full management
  'sales.quotation.view',
  'sales.quotation.create',
  'sales.quotation.edit',
  'sales.quotation.delete',
  'sales.quotation.approve',
  'sales.invoice.view',
  'sales.invoice.create',
  'sales.invoice.edit',
  'sales.invoice.delete',
  'sales.payment.view',
  'sales.payment.create',
  'sales.paymentList.view',
  'sales-representatives.view',
  // Finance & Treasury — expenses and payroll fully managed, cash-box movements tracked (view)
  'treasury.expense.view',
  'treasury.expense.create',
  'treasury.expense.edit',
  'treasury.expense.delete',
  'treasury.cash-box.view',
  'hr.payroll.view',
  'hr.payroll.create',
  'hr.payroll.edit',
  'hr.payroll.delete',
  'hr.payroll.approve',
  'hr.employee.view',
  // Financial Reports — view only
  'accounting.reports.view',
  // Monthly Stock Audit — conduct and record only, never approve
  'inventory.stockAudit.view',
  'inventory.stockAudit.create',
  // Settings — full management except partners and factory reset
  'settings.branch.view',
  'settings.branch.create',
  'settings.branch.edit',
  'settings.branch.delete',
  'settings.company.view',
  'settings.company.create',
  'settings.company.edit',
  'settings.company.delete',
  'settings.currency.view',
  'settings.currency.create',
  'settings.currency.edit',
  'settings.currency.delete',
  'settings.fiscal-year.view',
  'settings.fiscal-year.create',
  'settings.fiscal-year.approve',
  'settings.numbering-series.view',
  'settings.numbering-series.create',
  'settings.numbering-series.edit',
  'settings.numbering-series.delete',
  'settings.product-category.view',
  'settings.product-category.create',
  'settings.product-category.edit',
  'settings.product-category.delete',
  'settings.brand.view',
  'settings.brand.create',
  'settings.brand.edit',
  'settings.brand.delete',
  'settings.unit.view',
  'settings.unit.create',
  'settings.unit.edit',
  'settings.unit.delete',
  'settings.packageType.view',
  'settings.packageType.create',
  'settings.packageType.edit',
  'settings.packageType.delete',
  'settings.expenseCategory.view',
  'settings.expenseCategory.create',
  'settings.expenseCategory.edit',
  'settings.expenseCategory.delete',
  'settings.warehouse.view',
  'settings.warehouse.create',
  'settings.warehouse.edit',
  'settings.warehouse.delete',
  'settings.tax.view',
  'settings.tax.create',
  'settings.tax.edit',
  'settings.tax.delete',
];

/**
 * Mirrors the Printing-Press-only "مدير فرع" role seeded in run-seed.ts — a distinct, narrower
 * role from the generic Manager above: Quotations view+create only (no edit), Sales Invoices full
 * access including receiving payments (sales.payment.*), no sales-representatives.view.
 * `restrictedCompanyId` (set on the role row itself, see enforceOfflineRoleCompanyRestriction())
 * is what hard-locks any user given this role to the Printing Press company only — independent of
 * this permission list. The specific branch a "مدير فرع" manages is chosen per-user in the Users &
 * Roles "add user" form's conditional branch select, which also auto-provisions a
 * SalesRepresentative row for that user/branch — see syncOfflineBranchManagerRepresentative().
 */
const BRANCH_MANAGER_ROLE_NAME = 'مدير فرع';
const BRANCH_MANAGER_PRESS_PERMISSION_CODES = [
  'dashboard.view',
  'sales.quotation.view',
  'sales.quotation.create',
  'inventory.product.view',
  'sales.invoice.view',
  'sales.invoice.create',
  'sales.payment.view',
  'sales.payment.create',
  'treasury.cash-box.view',
];

const STORAGE_PREFIX = 'erp_offline_';

function genId(): string {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Today's date in the browser's local calendar, as YYYY-MM-DD — NOT
 * `toISOString().slice(0, 10)`, which is the UTC calendar date and is the wrong day for part of
 * the day in any positive-UTC-offset timezone (matches frontend/src/lib/date-utils.ts:localToday).
 */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Generic table storage
// ---------------------------------------------------------------------------

function readTable<T>(name: string): T[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + name);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeTable<T>(name: string, rows: T[]): void {
  localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(rows));
}

/** When `companyId` is passed, the sequence is counted only against that company's own rows — so
 * each company's document numbers start at 1 independently instead of sharing one global counter. */
function nextDocNumber(name: string, prefix: string, companyId?: string): string {
  const rows = readTable<any>(name);
  const scoped = companyId ? rows.filter((r: any) => r.companyId === companyId) : rows;
  return `${prefix}-${String(scoped.length + 1).padStart(6, '0')}`;
}

/** Returns the reset-period key a date falls in ('2026' yearly, '2026-07' monthly, null = never resets). */
function periodKeyFor(resetPeriod: string | undefined, date: Date): string | null {
  if (resetPeriod === 'YEARLY') return String(date.getFullYear());
  if (resetPeriod === 'MONTHLY') return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return null;
}

/**
 * Mirrors the real backend's NumberingSeriesService.tryGetNextNumber(): reads the configured
 * series for this document type (if any), applies a period reset when due, reserves the current
 * number, and returns the formatted string — or null when no series has been configured, so
 * callers can fall back to their old ad-hoc numbering.
 */
function tryGetNextNumber(documentType: string): string | null {
  const rows = readTable<any>('numberingSeries');
  const series = rows.find((s) => s.documentType === documentType);
  if (!series) return null;

  const currentKey = periodKeyFor(series.resetPeriod, new Date());
  if (currentKey !== null && series.lastResetKey !== currentKey) {
    series.nextNumber = series.startNumber ?? 1;
    series.lastResetKey = currentKey;
  }

  const current = series.nextNumber ?? series.startNumber ?? 1;
  series.nextNumber = current + 1;
  writeTable('numberingSeries', rows);

  const padded = String(current).padStart(series.padLength ?? 5, '0');
  return `${series.prefix ?? ''}${padded}${series.suffix ?? ''}`;
}

// ---------------------------------------------------------------------------
// Seed data — mirrors backend/src/database/seeds/run-seed.ts closely enough
// to make the offline demo feel populated rather than empty.
// ---------------------------------------------------------------------------

/**
 * Repairs the roles table on every load (not just first seed) so a browser that already had
 * offline data seeded before the Manager role / '*' wildcard existed picks up the fix without
 * needing its localStorage cleared — e.g. an admin account created before this fix would be
 * stuck with an empty permissions array forever otherwise, since ensureSeeded() only runs once.
 */
function repairRoles() {
  const roles = readTable<any>('roles');
  let changed = false;

  let admin = roles.find((r) => r.id === 'role-admin');
  if (!admin) {
    roles.push({ id: 'role-admin', name: 'Administrator', description: 'Full access', isSystemRole: true, permissions: ['*'] });
    changed = true;
  } else if (!admin.permissions?.includes('*')) {
    admin.permissions = ['*'];
    changed = true;
  }

  let manager = roles.find((r) => r.id === 'role-manager');
  if (!manager) {
    roles.push({
      id: 'role-manager',
      name: 'Manager',
      description:
        'Branch manager — full dashboard, sales, treasury/payroll and general settings management; purchasing (suppliers/products/purchase receipts) limited to view+create; financial reports view-only; monthly stock audit conduct+record without approval; partners and factory reset blocked',
      isSystemRole: false,
      restrictedCompanyId: null,
      permissions: MANAGER_PERMISSION_CODES,
    });
    changed = true;
  } else if (MANAGER_PERMISSION_CODES.some((code) => !manager.permissions?.includes(code))) {
    manager.permissions = MANAGER_PERMISSION_CODES;
    changed = true;
  }

  const pressId = OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')!.id;
  let branchManagerPress = roles.find((r) => r.id === 'role-branch-manager-press');
  if (!branchManagerPress) {
    roles.push({
      id: 'role-branch-manager-press',
      name: BRANCH_MANAGER_ROLE_NAME,
      description: 'Branch manager restricted exclusively to the Printing Press company',
      isSystemRole: false,
      restrictedCompanyId: pressId,
      permissions: BRANCH_MANAGER_PRESS_PERMISSION_CODES,
    });
    changed = true;
  } else if (
    branchManagerPress.name !== BRANCH_MANAGER_ROLE_NAME ||
    BRANCH_MANAGER_PRESS_PERMISSION_CODES.some((code) => !branchManagerPress.permissions?.includes(code)) ||
    branchManagerPress.restrictedCompanyId !== pressId
  ) {
    branchManagerPress.name = BRANCH_MANAGER_ROLE_NAME;
    branchManagerPress.permissions = BRANCH_MANAGER_PRESS_PERMISSION_CODES;
    branchManagerPress.restrictedCompanyId = pressId;
    changed = true;
  }

  if (changed) writeTable('roles', roles);
}

/** Mirrors UsersService's enforceRoleCompanyRestriction(): a role like "مدير فرع - المطبعة"
 * (restrictedCompanyId set) hard-locks any user given it to that one company, overriding whatever
 * companyIds the caller sent. Returns companyIds unchanged when none of the given roles carry one. */
function enforceOfflineRoleCompanyRestriction(roles: any[], companyIds: string[] | undefined): string[] | undefined {
  const restricted = roles.find((r) => r?.restrictedCompanyId);
  if (!restricted) return companyIds;
  return [restricted.restrictedCompanyId];
}

/**
 * Mirrors UsersService.syncBranchManagerRepresentative(): when a user is saved with the "مدير
 * فرع" role and a branch selected, auto-provisions (or repairs) a matching salesRepresentatives
 * row so they immediately show up under "مدراء الفروع" for an admin to open and finish the
 * remaining commission/target data. Does nothing for any other role, or when no branch was chosen.
 */
function syncOfflineBranchManagerRepresentative(user: any, roles: any[], branchId: string | null | undefined): void {
  const branchManagerRole = roles.find((r) => r?.name === BRANCH_MANAGER_ROLE_NAME);
  if (!branchManagerRole || !branchId) return;
  const companyId = branchManagerRole.restrictedCompanyId ?? user.companyId;
  if (!companyId) return;

  const reps = readTable<any>('salesRepresentatives');
  const existing = reps.find((r) => r.userId === user.id);
  if (existing) {
    existing.branchId = branchId;
    existing.companyId = companyId;
    writeTable('salesRepresentatives', reps);
    return;
  }

  const code = tryGetNextNumber('SALES_REPRESENTATIVE') || `REP-${Date.now()}`;
  genericCreate('salesRepresentatives', {
    companyId,
    code,
    name: user.fullName,
    phone: user.phone ?? null,
    email: user.email,
    branchId,
    userId: user.id,
    // Mirrors UsersService's BRANCH_MANAGER_DEFAULT_COMMISSION_RATE — only on first-time creation.
    commissionRate: 5,
  });
}

/**
 * Mirrors UsersService.syncBranchManagerEmployee(): same auto-provisioning idea as
 * syncOfflineBranchManagerRepresentative above, but for the HR module's employees table — lets a
 * logged-in branch manager's own payroll data be resolved from their userId (see
 * buildManagerDashboard()). The admin still edits the real baseSalary afterwards via Employees;
 * this only guarantees the link exists.
 */
function syncOfflineBranchManagerEmployee(user: any, roles: any[], branchId: string | null | undefined): void {
  const branchManagerRole = roles.find((r) => r?.name === BRANCH_MANAGER_ROLE_NAME);
  if (!branchManagerRole || !branchId) return;
  const companyId = branchManagerRole.restrictedCompanyId ?? user.companyId;
  if (!companyId) return;

  const employees = readTable<any>('employees');
  const existing = employees.find((e) => e.userId === user.id);
  if (existing) {
    existing.branchId = branchId;
    existing.companyId = companyId;
    writeTable('employees', employees);
    return;
  }

  genericCreate('employees', {
    companyId,
    branchId,
    name: user.fullName,
    jobTitle: BRANCH_MANAGER_ROLE_NAME,
    baseSalary: 0,
    isActive: true,
    userId: user.id,
  }, { createdAt: new Date().toISOString() });
}

/**
 * Repairs the warehouses table on every load (not just first seed) so a browser seeded before
 * Warehouse.branchId was set at seed time still ends up with each warehouse permanently linked to
 * its company's branch — same self-healing reasoning as repairRoles() above. Each company has
 * exactly one branch today, so the match is unambiguous; picks isMainBranch when more than one
 * exists for a company.
 */
function repairWarehouseBranchLinks() {
  const warehouses = readTable<any>('warehouses');
  const branches = readTable<any>('branches');
  let changed = false;
  for (const w of warehouses) {
    if (w.branchId) continue;
    const companyBranches = branches.filter((b) => b.companyId === w.companyId);
    const match = companyBranches.find((b) => b.isMainBranch) ?? companyBranches[0];
    if (match) {
      w.branchId = match.id;
      changed = true;
    }
  }
  if (changed) writeTable('warehouses', warehouses);
}

/**
 * Migrates a browser that was already seeded under the older default admin identity
 * (admin@erp.local / System Administrator) to the current one, in place — same as run-seed.ts's
 * "find the existing Administrator by isSystemRole, update it" logic on the real backend — so
 * re-running this never creates a second, duplicate admin account alongside the old one.
 */
function migrateAdminIdentity() {
  const users = readTable<any>('users');
  const admin = users.find((u) => u.roles?.some((r: any) => r.isSystemRole));
  if (!admin) return;
  let changed = false;
  if (admin.email !== OFFLINE_ADMIN_EMAIL) {
    admin.email = OFFLINE_ADMIN_EMAIL;
    admin.fullName = OFFLINE_ADMIN_FULL_NAME;
    changed = true;
  }
  // Backfills the phone number on a browser that was already seeded before this field existed —
  // one-time only (checks for "never set" via falsy, not "doesn't match the default"), since this
  // runs on every single offline request (ensureSeeded() calls this unconditionally) and the admin
  // can now change their own phone number via the self-service "Account Settings" modal — a
  // not-equal-to-default check would silently stomp that edit back to the seed default on the very
  // next request.
  if (!admin.phone) {
    admin.phone = OFFLINE_ADMIN_PHONE;
    changed = true;
  }
  if (changed) writeTable('users', users);
}

/**
 * Migrates a browser that was seeded before multi-company support existed (a single implicit
 * company) to the 3-company model, in place — adds the two new companies (AC/PRESS) plus their
 * own branch/warehouse/reference data, without touching the original company's id or its existing
 * data (every row that already referenced it keeps working unchanged). Existing reference-data
 * rows that predate per-company scoping entirely (currencies/taxes/units/package types/categories/
 * brands/expense categories/partners — and products/customers/suppliers/reps as a safety net,
 * though those were already company-tagged before this) are retroactively assigned to the
 * original company, since nothing else existed for them to belong to.
 */
function migrateToMultiCompany() {
  const companies = readTable<any>('companies');
  const missingDefs = OFFLINE_COMPANY_DEFS.filter((def) => !companies.some((c) => c.id === def.id));
  if (missingDefs.length) {
    for (const def of missingDefs) companies.push({ ...def, warnOnSellBelowCost: true, isActive: true });
    writeTable('companies', companies);

    const branches = readTable<any>('branches');
    const warehouses = readTable<any>('warehouses');
    const units = readTable<any>('units');
    const currencies = readTable<any>('currencies');
    const taxes = readTable<any>('taxes');
    const packageTypes = readTable<any>('packageTypes');

    for (const def of missingDefs) {
      branches.push({ id: `branch-main-${def.id}`, code: 'HQ', nameEn: 'Head Office', nameAr: 'المكتب الرئيسي', isMainBranch: true, isActive: true, companyId: def.id });
      warehouses.push({ id: `wh-main-${def.id}`, code: 'MAIN', nameEn: 'Main Warehouse', nameAr: 'المستودع الرئيسي', isDefault: true, isActive: true, companyId: def.id, branchId: `branch-main-${def.id}` });
      units.push({ id: `unit-pcs-${def.id}`, code: 'PCS', nameEn: 'Piece', nameAr: 'قطعة', isActive: true, companyId: def.id });
      currencies.push({ id: `cur-usd-${def.id}`, code: 'USD', nameEn: 'US Dollar', nameAr: 'دولار أمريكي', symbol: '$', isBaseCurrency: true, isActive: true, companyId: def.id });
      taxes.push({ id: `tax-0-${def.id}`, code: 'NOTAX', nameEn: 'No Tax', rate: 0, isActive: true, companyId: def.id });
      for (const p of [
        { code: 'CARTON', nameEn: 'Carton', nameAr: 'كرتون' },
        { code: 'SHAD', nameEn: 'Bundle', nameAr: 'شدة' },
        { code: 'PACKET', nameEn: 'Packet', nameAr: 'باكيت' },
        { code: 'ROLL', nameEn: 'Roll', nameAr: 'رول' },
        { code: 'BAG', nameEn: 'Bag', nameAr: 'كيس' },
        { code: 'BOX', nameEn: 'Box', nameAr: 'علبة' },
        { code: 'PIECE', nameEn: 'Piece', nameAr: 'قطعة' },
        { code: 'MACHINE', nameEn: 'Machine', nameAr: 'ماكينة' },
        { code: 'BALE', nameEn: 'Bale', nameAr: 'بالة' },
      ]) {
        packageTypes.push({ id: `pkg-${p.code.toLowerCase()}-${def.id}`, ...p, isActive: true, companyId: def.id });
      }
    }
    writeTable('branches', branches);
    writeTable('warehouses', warehouses);
    writeTable('units', units);
    writeTable('currencies', currencies);
    writeTable('taxes', taxes);
    writeTable('packageTypes', packageTypes);
  }

  if (!localStorage.getItem(STORAGE_PREFIX + 'userCompanies')) writeTable('userCompanies', []);

  const untaggedTables = [
    'branches', 'warehouses', 'currencies', 'taxes', 'units', 'packageTypes',
    'productCategories', 'brands', 'expenseCategories', 'partners',
    'products', 'customers', 'suppliers', 'salesRepresentatives', 'commissionExceptions',
    // purchaseReceipts never stamped companyId at all until this fix — any receipt created before
    // it exists in localStorage with no companyId, which silently zeroed out "مشتريات اليوم" for
    // every company since buildDashboardSummary's companyId filter excluded them all.
    'purchaseReceipts',
  ];
  for (const name of untaggedTables) {
    const rows = readTable<any>(name);
    let changed = false;
    for (const row of rows) {
      if (!row.companyId) {
        row.companyId = OFFLINE_COMPANY_ID;
        changed = true;
      }
    }
    if (changed) writeTable(name, rows);
  }

  const users = readTable<any>('users');
  let usersChanged = false;
  for (const user of users) {
    if (!user.companyId) {
      user.companyId = OFFLINE_COMPANY_ID;
      user.branchId = user.branchId ?? `branch-main-${OFFLINE_COMPANY_ID}`;
      usersChanged = true;
    }
  }
  if (usersChanged) writeTable('users', users);
}

/**
 * Backfills companyId on any stock level created before getOrCreateStockLevel() started stamping
 * it — unlike the generic untaggedTables backfill above, this derives each row's companyId from
 * its OWN warehouse (not a blanket OFFLINE_COMPANY_ID), since stock levels can legitimately belong
 * to any of the three companies and blindly assigning the default would silently move a
 * التكييفات/المطبعة warehouse's stock into القرطاسية ومستلزمات الطباعة's inventory value instead.
 */
function migrateStockLevelsCompanyId() {
  const warehouses = readTable<any>('warehouses');
  const backfill = (tableName: string) => {
    const rows = readTable<any>(tableName);
    let changed = false;
    for (const row of rows) {
      if (!row.companyId) {
        const rowWarehouseId = row.warehouseId ?? row.fromWarehouseId;
        const warehouse = warehouses.find((w) => w.id === rowWarehouseId);
        row.companyId = warehouse?.companyId ?? OFFLINE_COMPANY_ID;
        changed = true;
      }
    }
    if (changed) writeTable(tableName, rows);
  };
  backfill('stockLevels');
  // stockMovements/stockTransfers never stamped companyId at all until this fix — GET
  // /inventory/stock/movements and .../transfers had no way to tell them apart, so every
  // company's stock history leaked into whichever one happened to be active. Derived from the
  // row's own warehouse (fromWarehouseId for transfers), never a blanket default.
  backfill('stockMovements');
  backfill('stockTransfers');
}

/**
 * Ensures the "makroom204@gmail.com" Manager account (restricted to القرطاسية ومستلزمات الطباعة
 * only) exists — mirrors run-seed.ts's equivalent block on the real backend. Called exactly once,
 * from the initial bootstrap seed only (NOT from every ensureSeeded() call — see the comment at
 * that call site) — a one-time demo convenience must never re-create a row an admin has since
 * deliberately deleted through the real Users & Roles delete flow.
 * Note: this offline mock never stores real per-user passwords — like every other demo account,
 * it logs in with the shared OFFLINE_DEMO_PASSWORD, not the real backend's actual "makroom204".
 */
function ensureExtraManagerUser() {
  const users = readTable<any>('users');
  const email = 'makroom204@gmail.com';
  const phone = '99970704';
  let user = users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    const roles = readTable<any>('roles');
    const managerRole = roles.find((r) => r.id === 'role-manager');
    user = {
      id: genId(),
      email,
      phone,
      fullName: 'Makroom204',
      isActive: true,
      companyId: OFFLINE_COMPANY_ID,
      branchId: `branch-main-${OFFLINE_COMPANY_ID}`,
      roles: managerRole ? [{ id: managerRole.id, name: managerRole.name, isSystemRole: managerRole.isSystemRole }] : [],
    };
    users.push(user);
    writeTable('users', users);
  } else if (!user.phone) {
    // Backfills a browser whose Makroom204 row was seeded before phone-based login existed —
    // otherwise this account could never log in again once email stopped being the lookup key.
    user.phone = phone;
    writeTable('users', users);
  }

  const links = readTable<any>('userCompanies');
  if (!links.some((l) => l.userId === user.id && l.companyId === OFFLINE_COMPANY_ID)) {
    links.push({ id: genId(), userId: user.id, companyId: OFFLINE_COMPANY_ID });
    writeTable('userCompanies', links);
  }
}

/** Backfills the Printing Press walk-in customer for a browser that was already seeded before
 * this tenant-scoped restriction existed — same idempotent "ensure it exists" pattern as
 * ensureExtraManagerUser(). */
function ensureWalkInCustomerForPrintingPress() {
  const pressId = OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')?.id;
  if (!pressId) return;
  const customers = readTable<any>('customers');
  if (customers.some((c) => c.companyId === pressId && c.code === 'WALKIN')) return;
  customers.push({
    id: `walkin-${pressId}`,
    isActive: true,
    name: 'عميل نقدي / Walk-in Customer',
    mobile: '',
    address: '',
    companyId: pressId,
    code: 'WALKIN',
    openingBalance: 0,
    creditStatus: 'RELIABLE',
    salesRepresentativeId: null,
  });
  writeTable('customers', customers);
}

/**
 * Full factory reset: clears every transactional/demo-master-data table back to empty and resets
 * document numbering counters to their starting value, but never touches configuration — company,
 * branches, currencies, taxes, units, package types, product categories, brands, partners, expense
 * categories, shipping expense types, exchange rates, users, or roles/permissions. Mirrors exactly
 * what an admin would expect from "reset to a fresh install without losing my setup or my login."
 */
function factoryResetDemoData() {
  const clearTables = [
    'customers',
    'suppliers',
    'salesRepresentatives',
    'commissionExceptions',
    'products',
    'quotations',
    'salesOrders',
    'salesInvoices',
    'salesPayments',
    'cashMovements',
    'stockLevels',
    'stockMovements',
    'stockTransfers',
    'purchaseReceipts',
    'supplierPayments',
    'recurringExpenses',
    'warehouses',
    'shipments',
    'shipmentExpenses',
    'shipmentPayments',
    'importCargoItems',
  ];
  for (const name of clearTables) {
    writeTable(name, []);
  }

  // Document numbering definitions (e.g. the RCV-/INV- prefix config) are kept, only their
  // running counters restart — so the first receipt recorded after a reset is really RCV-000001.
  const series = readTable<any>('numberingSeries');
  for (const s of series) {
    s.nextNumber = s.startNumber ?? 1;
    delete s.lastResetKey;
  }
  writeTable('numberingSeries', series);

  return { success: true, clearedTables: clearTables };
}

function ensureSeeded() {
  if (localStorage.getItem(STORAGE_PREFIX + 'seeded')) {
    repairRoles();
    repairWarehouseBranchLinks();
    migrateAdminIdentity();
    migrateToMultiCompany();
    migrateStockLevelsCompanyId();
    // Deliberately NOT calling ensureExtraManagerUser() here — it only runs once, at initial
    // bootstrap below. This used to run on every load (see its own docstring, now stale), which
    // meant deleting this demo account was pointless: the very next request that touched
    // ensureSeeded() — e.g. the GET /users refetch the delete's own success handler triggers —
    // silently recreated it, so a real "حذف" click appeared to succeed (the row was genuinely
    // removed) but the account reappeared moments later with a new id. A one-time convenience
    // seed must never fight a user's later, deliberate deletion of that same row.
    ensureWalkInCustomerForPrintingPress();
    generateDueRecurringExpenses();
    generateDueInstallmentNotifications();
    return;
  }

  writeTable('companies', OFFLINE_COMPANY_DEFS.map((c) => ({ ...c, warnOnSellBelowCost: true, isActive: true })));

  const branches: any[] = [];
  const warehouses: any[] = [];
  const units: any[] = [];
  const packageTypes: any[] = [];
  const currencies: any[] = [];
  const taxes: any[] = [];
  for (const c of OFFLINE_COMPANY_DEFS) {
    branches.push({ id: `branch-main-${c.id}`, code: 'HQ', nameEn: 'Head Office', nameAr: 'المقر الرئيسي', isMainBranch: true, isActive: true, companyId: c.id });
    warehouses.push({ id: `wh-main-${c.id}`, code: 'MAIN', nameEn: 'Main Warehouse', nameAr: 'المخزن الرئيسي', isDefault: true, isActive: true, companyId: c.id, branchId: `branch-main-${c.id}` });
    units.push({ id: `unit-pcs-${c.id}`, code: 'PCS', nameEn: 'Piece', nameAr: 'قطعة', isActive: true, companyId: c.id });
    currencies.push({ id: `cur-usd-${c.id}`, code: 'USD', nameEn: 'US Dollar', nameAr: 'دولار أمريكي', symbol: '$', isBaseCurrency: true, isActive: true, companyId: c.id });
    taxes.push({ id: `tax-0-${c.id}`, code: 'NOTAX', nameEn: 'No Tax', rate: 0, isActive: true, companyId: c.id });
    for (const p of [
      { code: 'CARTON', nameEn: 'Carton', nameAr: 'كرتون' },
      { code: 'SHAD', nameEn: 'Bundle', nameAr: 'شدة' },
      { code: 'PACKET', nameEn: 'Packet', nameAr: 'باكيت' },
      { code: 'ROLL', nameEn: 'Roll', nameAr: 'رول' },
      { code: 'BAG', nameEn: 'Bag', nameAr: 'كيس' },
      { code: 'BOX', nameEn: 'Box', nameAr: 'علبة' },
      { code: 'PIECE', nameEn: 'Piece', nameAr: 'قطعة' },
      { code: 'MACHINE', nameEn: 'Machine', nameAr: 'ماكينة' },
      { code: 'BALE', nameEn: 'Bale', nameAr: 'بالة' },
    ]) {
      packageTypes.push({ id: `pkg-${p.code.toLowerCase()}-${c.id}`, ...p, isActive: true, companyId: c.id });
    }
  }
  writeTable('units', units);
  writeTable('packageTypes', packageTypes);
  writeTable('warehouses', warehouses);
  writeTable('branches', branches);
  writeTable('currencies', currencies);
  writeTable('taxes', taxes);
  writeTable('productCategories', []);
  writeTable('brands', []);
  writeTable('partners', []);
  writeTable('numberingSeries', []);
  writeTable('expenseCategories', []);
  writeTable('userCompanies', []);
  writeTable('roles', [
    // '*' is an offline-demo-only wildcard understood by auth-store's hasPermission/hasAnyPermission —
    // the real backend never issues it, permissions are always concrete `${module}.${action}` codes there.
    { id: 'role-admin', name: 'Administrator', description: 'Full access', isSystemRole: true, restrictedCompanyId: null, permissions: ['*'] },
    {
      id: 'role-manager',
      name: 'Manager',
      description:
        'Branch manager — full dashboard, sales, treasury/payroll and general settings management; purchasing (suppliers/products/purchase receipts) limited to view+create; financial reports view-only; monthly stock audit conduct+record without approval; partners and factory reset blocked',
      isSystemRole: false,
      restrictedCompanyId: null,
      permissions: MANAGER_PERMISSION_CODES,
    },
    {
      id: 'role-branch-manager-press',
      name: BRANCH_MANAGER_ROLE_NAME,
      description: 'Branch manager restricted exclusively to the Printing Press company',
      isSystemRole: false,
      restrictedCompanyId: OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')!.id,
      permissions: BRANCH_MANAGER_PRESS_PERMISSION_CODES,
    },
  ]);
  writeTable('users', [
    {
      id: 'offline-demo-user',
      email: OFFLINE_ADMIN_EMAIL,
      fullName: OFFLINE_ADMIN_FULL_NAME,
      phone: OFFLINE_ADMIN_PHONE,
      isActive: true,
      companyId: OFFLINE_COMPANY_DEFS[0].id,
      branchId: `branch-main-${OFFLINE_COMPANY_DEFS[0].id}`,
      roles: [{ id: 'role-admin', name: 'Administrator', isSystemRole: true }],
    },
  ]);
  // Printing Press has no Customers screen at all (confirmed scope: hidden for this one tenant
  // only) — every sale there is attributed to this single walk-in customer instead.
  {
    const pressId = OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')!.id;
    writeTable('customers', [
      {
        id: `walkin-${pressId}`,
        isActive: true,
        name: 'عميل نقدي / Walk-in Customer',
        mobile: '',
        address: '',
        companyId: pressId,
        code: 'WALKIN',
        openingBalance: 0,
        creditStatus: 'RELIABLE',
        salesRepresentativeId: null,
      },
    ]);
  }
  writeTable('suppliers', []);
  writeTable('salesRepresentatives', []);
  writeTable('commissionExceptions', []);
  writeTable('products', []);
  writeTable('quotations', []);
  writeTable('salesOrders', []);
  writeTable('salesInvoices', []);
  writeTable('salesPayments', []);
  writeTable('cashMovements', []);
  writeTable('stockLevels', []);
  writeTable('stockMovements', []);
  writeTable('stockTransfers', []);
  writeTable('stockAudits', []);
  writeTable('stockAuditLines', []);
  writeTable('purchaseReceipts', []);
  writeTable('supplierPayments', []);
  writeTable('recurringExpenses', []);
  writeTable('installmentPlans', []);
  writeTable('installmentPlanLines', []);
  writeTable('installmentScheduleItems', []);
  writeTable('installmentPayments', []);
  writeTable('whatsappOutboxMessages', []);
  writeTable('employees', []);
  writeTable('employeeLeaves', []);
  writeTable('payrollRuns', []);
  writeTable('payrollRunLines', []);

  localStorage.setItem(STORAGE_PREFIX + 'seeded', '1');
  ensureExtraManagerUser();
}

// ---------------------------------------------------------------------------
// Shared line-total math (mirrors frontend/src/features/sales/SalesLineEditor.tsx)
// ---------------------------------------------------------------------------

interface LineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxPercent?: number;
}

function computeLineTotal(line: LineInput) {
  const gross = line.quantity * line.unitPrice;
  const net = gross * (1 - (line.discountPercent ?? 0) / 100);
  return net * (1 + (line.taxPercent ?? 0) / 100);
}

function computeTotals(lines: LineInput[]) {
  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  for (const line of lines) {
    const gross = line.quantity * line.unitPrice;
    const discount = gross * ((line.discountPercent ?? 0) / 100);
    const net = gross - discount;
    const tax = net * ((line.taxPercent ?? 0) / 100);
    subtotal += net;
    taxTotal += tax;
    discountTotal += discount;
  }
  return { subtotal, taxTotal, discountTotal, grandTotal: subtotal + taxTotal };
}

// ---------------------------------------------------------------------------
// Stock helpers (weighted-average, mirrors the real StockService)
// ---------------------------------------------------------------------------

function getOrCreateStockLevel(productId: string, warehouseId: string) {
  const levels = readTable<any>('stockLevels');
  let level = levels.find((l) => l.productId === productId && l.warehouseId === warehouseId);
  if (!level) {
    // Mirrors StockService.getOrCreateLevel() on the real backend, which always stamps companyId
    // on creation — omitting it here silently excluded every stock level from company-wide totals
    // (e.g. buildDashboardSummary's inventoryValue), even though the per-warehouse views still
    // worked fine since those filter by warehouseId, not companyId.
    const warehouse = readTable<any>('warehouses').find((w) => w.id === warehouseId);
    level = {
      id: genId(),
      companyId: warehouse?.companyId ?? OFFLINE_COMPANY_ID,
      productId,
      warehouseId,
      quantityOnHand: 0,
      averageCost: 0,
    };
    levels.push(level);
    writeTable('stockLevels', levels);
  }
  return level;
}

function saveStockLevel(level: any) {
  const levels = readTable<any>('stockLevels');
  const idx = levels.findIndex((l) => l.id === level.id);
  if (idx >= 0) levels[idx] = level;
  writeTable('stockLevels', levels);
}

function addMovement(entry: any) {
  const movements = readTable<any>('stockMovements');
  // Never stamping companyId here meant every stock movement across all 3 companies was
  // indistinguishable — GET /inventory/stock/movements had no way to filter them apart, so the
  // Stock Movement Report leaked every other company's history into whichever one was active.
  // Derived from the warehouse (never a blanket default), matching getOrCreateStockLevel()'s rule.
  const companyId = entry.companyId ?? readTable<any>('warehouses').find((w) => w.id === entry.warehouseId)?.companyId ?? OFFLINE_COMPANY_ID;
  movements.unshift({ id: genId(), createdAt: new Date().toISOString(), ...entry, companyId });
  writeTable('stockMovements', movements);
}

function issueStock(
  productId: string,
  warehouseId: string,
  quantity: number,
  referenceType: string,
  referenceNumber: string,
  movementType: string = 'SALES_ISSUE',
) {
  const level = getOrCreateStockLevel(productId, warehouseId);
  const unitCost = level.averageCost;
  level.quantityOnHand -= quantity;
  saveStockLevel(level);
  addMovement({
    productId,
    warehouseId,
    type: movementType,
    quantity,
    unitCost,
    totalCost: unitCost * quantity,
    balanceQuantityAfter: level.quantityOnHand,
    balanceAverageCostAfter: level.averageCost,
    referenceType,
    referenceNumber,
  });
  return unitCost;
}

function receiveStock(
  productId: string,
  warehouseId: string,
  quantity: number,
  unitCost: number,
  referenceType: string,
  referenceNumber: string,
  movementType?: string,
) {
  const level = getOrCreateStockLevel(productId, warehouseId);
  const totalExistingValue = level.quantityOnHand * level.averageCost;
  const totalNewValue = quantity * unitCost;
  const newQuantity = level.quantityOnHand + quantity;
  level.averageCost = newQuantity > 0 ? (totalExistingValue + totalNewValue) / newQuantity : unitCost;
  level.quantityOnHand = newQuantity;
  saveStockLevel(level);

  const products = readTable<any>('products');
  const product = products.find((p) => p.id === productId);
  if (product) {
    product.averageCost = level.averageCost;
    writeTable('products', products);
  }
  addMovement({
    productId,
    warehouseId,
    type: movementType ?? (referenceType === 'STOCK_ADJUSTMENT' ? 'ADJUSTMENT_IN' : 'OPENING_STOCK'),
    quantity,
    unitCost,
    totalCost: totalNewValue,
    balanceQuantityAfter: level.quantityOnHand,
    balanceAverageCostAfter: level.averageCost,
    referenceType,
    referenceNumber,
  });
}

// ---------------------------------------------------------------------------
// Direct cash-flow ledger (mirrors CashMovementsService — no debit/credit account pairs,
// just one row per actual movement of money into or out of the treasury).
// ---------------------------------------------------------------------------

function recordCashMovement(input: {
  companyId?: string;
  branchId?: string | null;
  movementDate: string;
  type: 'INCOME' | 'EXPENSE';
  account: 'CASH' | 'BANK';
  amount: number;
  sourceType: string;
  sourceId?: string | null;
  category?: string | null;
  partyCustomerId?: string | null;
  partySupplierId?: string | null;
  partnerId?: string | null;
  salesRepresentativeId?: string | null;
  description?: string | null;
  createdById?: string;
}) {
  const documentNumber = tryGetNextNumber('CASH_MOVEMENT') ?? `CM-${Date.now()}`;
  const movements = readTable<any>('cashMovements');
  const movement = {
    id: genId(),
    documentNumber,
    movementDate: input.movementDate,
    type: input.type,
    account: input.account,
    amount: Number(input.amount),
    sourceType: input.sourceType,
    sourceId: input.sourceId ?? null,
    category: input.category ?? null,
    partyCustomerId: input.partyCustomerId ?? null,
    partySupplierId: input.partySupplierId ?? null,
    partnerId: input.partnerId ?? null,
    salesRepresentativeId: input.salesRepresentativeId ?? null,
    description: input.description ?? null,
    companyId: input.companyId ?? OFFLINE_COMPANY_ID,
    branchId: input.branchId ?? null,
    createdById: input.createdById ?? 'offline-demo-user',
    createdAt: new Date().toISOString(),
  };
  movements.push(movement);
  writeTable('cashMovements', movements);
  return movement;
}

/** 'YYYY-MM' for the given date, local calendar — matches the rest of this file's date handling. */
function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Stands in for the real backend's monthly cron job: since there's no long-running server process
 * here to fire on the 1st, this runs lazily on every app load instead — for every active recurring
 * template not yet generated for the current calendar period, it records a real CashMovement dated
 * the 1st of the current month, exactly like the cron would. `lastGeneratedPeriod` keeps this
 * idempotent no matter how many times the app loads within the same month.
 */
function generateDueRecurringExpenses(): void {
  const period = periodOf(new Date());
  const firstOfMonth = `${period}-01`;
  const templates = readTable<any>('recurringExpenses');
  let changed = false;
  for (const template of templates) {
    if (!template.isActive || template.lastGeneratedPeriod === period) continue;
    recordCashMovement({
      companyId: template.companyId,
      movementDate: firstOfMonth,
      type: 'EXPENSE',
      account: template.account,
      amount: Number(template.amount),
      sourceType: 'MANUAL',
      category: template.category,
      description: template.description ?? null,
      createdById: template.createdById,
    });
    template.lastGeneratedPeriod = period;
    changed = true;
  }
  if (changed) writeTable('recurringExpenses', templates);
}

// ---------------------------------------------------------------------------
// Installment sales engine (mirrors backend/src/common/utils/installment-calculator.ts and
// InstallmentPlansService) — see woolly-conjuring-tower.md plan for the full design.
// ---------------------------------------------------------------------------

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Adds `months` calendar months to an ISO date, clamping to the last valid day of the target
 * month — mirrors backend/src/common/utils/installment-calculator.ts's addMonthsClamped(). */
function addMonthsClamped(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

function addDaysStr(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

interface InstallmentTerms {
  financedPrincipal: number;
  totalInterestAmount: number;
  totalPayable: number;
  installmentAmount: number;
}

/** Add-on/flat interest — mirrors computeInstallmentTerms() on the backend exactly. */
function computeInstallmentTerms(
  totalPrice: number,
  downPayment: number,
  interestType: 'MONTHLY' | 'YEARLY',
  interestRate: number,
  tenureMonths: number,
): InstallmentTerms {
  const financedPrincipal = round4(totalPrice - downPayment);
  const totalInterestAmount = round4(
    interestType === 'MONTHLY'
      ? financedPrincipal * (interestRate / 100) * tenureMonths
      : financedPrincipal * (interestRate / 100) * (tenureMonths / 12),
  );
  const totalPayable = round4(financedPrincipal + totalInterestAmount);
  const installmentAmount = round4(totalPayable / tenureMonths);
  return { financedPrincipal, totalInterestAmount, totalPayable, installmentAmount };
}

/** Mirrors generateInstallmentSchedule() on the backend — equal installments, last one absorbs
 * the rounding remainder. */
function generateInstallmentSchedule(purchaseDate: string, terms: InstallmentTerms, tenureMonths: number) {
  const monthlyPrincipal = round4(terms.financedPrincipal / tenureMonths);
  const monthlyInterest = round4(terms.totalInterestAmount / tenureMonths);
  const items: Array<{
    installmentNumber: number;
    dueDate: string;
    principalPortion: number;
    interestPortion: number;
    amountDue: number;
  }> = [];
  let principalAccrued = 0;
  let interestAccrued = 0;
  for (let n = 1; n <= tenureMonths; n++) {
    const isLast = n === tenureMonths;
    const principalPortion = isLast ? round4(terms.financedPrincipal - principalAccrued) : monthlyPrincipal;
    const interestPortion = isLast ? round4(terms.totalInterestAmount - interestAccrued) : monthlyInterest;
    principalAccrued = round4(principalAccrued + principalPortion);
    interestAccrued = round4(interestAccrued + interestPortion);
    items.push({
      installmentNumber: n,
      dueDate: addMonthsClamped(purchaseDate, n),
      principalPortion,
      interestPortion,
      amountDue: round4(principalPortion + interestPortion),
    });
  }
  return items;
}

export type ScheduleItemStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';

/** Derives a schedule item's paid amount/status live from installmentPayments rows — never
 * cached, mirroring InstallmentPlansService.buildScheduleViews() on the backend. */
function buildInstallmentScheduleViews(plan: any, items: any[], payments: any[]) {
  const todayStr = today();
  return [...items]
    .sort((a, b) => a.installmentNumber - b.installmentNumber)
    .map((item) => {
      const amountDue = Number(item.amountDue);
      const paidForItem = payments
        .filter((p) => p.scheduleItemId === item.id)
        .reduce((s, p) => s + Number(p.amount), 0);
      const settledEarly = plan.status === 'SETTLED_EARLY';
      const amountPaid = settledEarly ? amountDue : round4(paidForItem);
      const remaining = settledEarly ? 0 : round4(amountDue - amountPaid);
      let status: ScheduleItemStatus;
      if (remaining <= 0.005) status = 'PAID';
      else if (amountPaid > 0.005) status = 'PARTIALLY_PAID';
      else if (item.dueDate < todayStr) status = 'OVERDUE';
      else status = 'PENDING';
      return {
        id: item.id,
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate,
        principalPortion: Number(item.principalPortion),
        interestPortion: Number(item.interestPortion),
        amountDue,
        amountPaid,
        remaining,
        status,
      };
    });
}

/** Once-per-browser-day pass mirroring InstallmentsNotificationCron: admin daily report (due
 * today/overdue), customer reminders (due in 2-3 days), and the 30-day auto-blacklist check. All
 * "sending" is DashboardWhatsAppProvider-equivalent: just logged into whatsappOutboxMessages,
 * where the Dashboard's outbox card reads it back — no real WhatsApp API exists yet. */
function generateDueInstallmentNotifications(): void {
  const todayStr = today();
  const marker = STORAGE_PREFIX + 'installmentNotifGenDate';
  if (localStorage.getItem(marker) === todayStr) return;
  localStorage.setItem(marker, todayStr);

  const AUTO_BLACKLIST_OVERDUE_DAYS = 30;
  const companies = readTable<any>('companies');
  const plans = readTable<any>('installmentPlans');
  const items = readTable<any>('installmentScheduleItems');
  const payments = readTable<any>('installmentPayments');
  const customers = readTable<any>('customers');
  const outbox = readTable<any>('whatsappOutboxMessages');
  let customersChanged = false;

  for (const company of companies) {
    const companyPlans = plans.filter((p) => p.companyId === company.id && p.status === 'ACTIVE');

    const dueOrOverdueLines: string[] = [];
    for (const plan of companyPlans) {
      const planItems = items.filter((i) => i.installmentPlanId === plan.id);
      for (const item of planItems) {
        if (item.dueDate > todayStr) continue;
        const paidForItem = payments
          .filter((p) => p.scheduleItemId === item.id)
          .reduce((s, p) => s + Number(p.amount), 0);
        const remaining = Number(item.amountDue) - paidForItem;
        if (remaining <= 0.005) continue;
        const customer = customers.find((c) => c.id === plan.customerId);
        dueOrOverdueLines.push(
          `- ${customer?.name ?? '—'}: قسط رقم ${item.installmentNumber}, تاريخ الاستحقاق ${item.dueDate}, المتبقي ${remaining.toFixed(2)}`,
        );
      }
    }
    if (dueOrOverdueLines.length > 0) {
      outbox.push({
        id: genId(),
        messageType: 'ADMIN_DAILY_REPORT',
        recipientLabel: 'الإدارة',
        recipientPhone: null,
        content: `تقرير الأقساط المستحقة اليوم والمتأخرة — ${company.nameAr}:\n${dueOrOverdueLines.join('\n')}`,
        relatedInstallmentPlanId: null,
        relatedScheduleItemId: null,
        status: 'SENT',
        companyId: company.id,
        createdAt: new Date().toISOString(),
      });
    }

    const in2 = addDaysStr(todayStr, 2);
    const in3 = addDaysStr(todayStr, 3);
    for (const plan of companyPlans) {
      const planItems = items.filter((i) => i.installmentPlanId === plan.id);
      for (const item of planItems) {
        if (item.dueDate < in2 || item.dueDate > in3) continue;
        const alreadySentToday = outbox.some(
          (m) =>
            m.relatedScheduleItemId === item.id &&
            m.messageType === 'CUSTOMER_REMINDER' &&
            String(m.createdAt ?? '').slice(0, 10) === todayStr,
        );
        if (alreadySentToday) continue;
        const customer = customers.find((c) => c.id === plan.customerId);
        outbox.push({
          id: genId(),
          messageType: 'CUSTOMER_REMINDER',
          recipientLabel: customer?.name ?? '—',
          recipientPhone: customer?.mobile ?? null,
          content: `تذكير: يستحق عليكم قسط بتاريخ ${item.dueDate} بمبلغ ${Number(item.amountDue).toFixed(2)}.`,
          relatedInstallmentPlanId: plan.id,
          relatedScheduleItemId: item.id,
          status: 'SENT',
          companyId: company.id,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const cutoff = addDaysStr(todayStr, -AUTO_BLACKLIST_OVERDUE_DAYS);
    const overdueCustomerIds = new Set<string>();
    for (const plan of companyPlans) {
      const planItems = items.filter((i) => i.installmentPlanId === plan.id);
      for (const item of planItems) {
        if (item.dueDate >= cutoff) continue;
        const paidForItem = payments
          .filter((p) => p.scheduleItemId === item.id)
          .reduce((s, p) => s + Number(p.amount), 0);
        if (Number(item.amountDue) - paidForItem > 0.005) overdueCustomerIds.add(plan.customerId);
      }
    }
    for (const custId of overdueCustomerIds) {
      const customer = customers.find((c) => c.id === custId);
      if (!customer || customer.creditStatus === 'BLOCKED') continue;
      customer.creditStatus = 'BLOCKED';
      customer.blockedReason = `حظر تلقائي: تأخر السداد أكثر من ${AUTO_BLACKLIST_OVERDUE_DAYS} يومًا`;
      customersChanged = true;
      outbox.push({
        id: genId(),
        messageType: 'ADMIN_DAILY_REPORT',
        recipientLabel: 'الإدارة',
        recipientPhone: null,
        content: `تنبيه: تم حظر العميل "${customer.name}" تلقائيًا من عقود التقسيط الجديدة بسبب تأخر السداد أكثر من ${AUTO_BLACKLIST_OVERDUE_DAYS} يومًا.`,
        relatedInstallmentPlanId: null,
        relatedScheduleItemId: null,
        status: 'SENT',
        companyId: company.id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  writeTable('whatsappOutboxMessages', outbox);
  if (customersChanged) writeTable('customers', customers);
}

/**
 * Mirrors CashMovementsService.getBalance(): a capital injection's BANK-tagged row is normally a
 * partner-equity attribution memo of money already counted via its linked CASH row (see
 * recordCashMovement calls under 'capital-injections' below) — never real bank-account money on
 * its own, so it's excluded from the BANK balance to avoid double-counting every contribution.
 * That memo row always carries a sourceId pointing back to its CASH twin. Printing Press's
 * single-row contributions (no twin, sourceId null) are real money in whichever account was
 * chosen and must NOT be excluded — hence gating on sourceId rather than just sourceType.
 */
function cashBalance(companyId: string, account: 'CASH' | 'BANK', asOfDate?: string, branchId?: string): number {
  const movements = readTable<any>('cashMovements').filter(
    (m) =>
      m.companyId === companyId &&
      m.account === account &&
      (!asOfDate || m.movementDate <= asOfDate) &&
      (!branchId || m.branchId === branchId) &&
      !(account === 'BANK' && m.sourceType === 'CAPITAL_INJECTION' && m.sourceId),
  );
  return movements.reduce((sum, m) => sum + (m.type === 'INCOME' ? Number(m.amount) : -Number(m.amount)), 0);
}

/**
 * Mirrors CashMovementsService.assertSufficientBalance(): Printing Press only, blocks any
 * purchase/expense payment that would drive a treasury account negative. `excludeAmount` lets a
 * caller editing an existing movement in place (not yet deleted/replaced) add back that
 * movement's own old amount before comparing, so replacing a payment doesn't falsely count itself
 * as an extra draw on the balance.
 */
function assertSufficientBalance(
  companyId: string,
  account: 'CASH' | 'BANK',
  amount: number,
  branchId?: string | null,
  excludeAmount = 0,
): void {
  if (amount <= 0) return;
  const company = readTable<any>('companies').find((c) => c.id === companyId);
  if (company?.code !== 'PRESS') return;

  const balance = cashBalance(companyId, account, undefined, branchId ?? undefined);
  const available = balance + excludeAmount;
  if (amount > available) {
    if (account === 'CASH') {
      throw new OfflineApiError(
        `عفواً، المبلغ المدفوع أكبر من الرصيد المتاح في الخزينة. الرصيد المالي المتاح حالياً هو ${available.toFixed(2)} د.ك`,
      );
    }
    throw new OfflineApiError('عفواً، المبلغ المدفوع أكبر من الرصيد المتاح في البنك');
  }
}

/**
 * Mirrors the backend's generalized getExpenseTransactions(): every EXPENSE cash movement of one
 * source type (MANUAL for the Operating Expenses tab, PAYROLL for the Salaries tab), newest first,
 * with the recording user's name resolved for display.
 */
function buildExpenseTransactions(companyId: string, sourceType: 'MANUAL' | 'PAYROLL', dateFrom?: string, dateTo?: string) {
  const users = readTable<any>('users');
  return readTable<any>('cashMovements')
    .filter(
      (m) =>
        m.companyId === companyId &&
        m.type === 'EXPENSE' &&
        m.sourceType === sourceType &&
        (!dateFrom || m.movementDate >= dateFrom) &&
        (!dateTo || m.movementDate <= dateTo),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((m) => ({
      id: m.id,
      date: m.movementDate,
      documentNumber: m.documentNumber,
      category: m.category,
      amount: Number(m.amount),
      account: m.account,
      branchId: m.branchId ?? null,
      description: m.description,
      createdByName: users.find((u) => u.id === m.createdById)?.fullName ?? '—',
    }));
}

/** Mirrors the backend's getManagerPartnerProfitTransactions(): every commission-payout and
 * dividend EXPENSE row combined into one list for the "أرباح المدراء والشركاء" tab, tagged with
 * which of the two it is and the recipient's resolved name. */
function buildManagerPartnerProfitTransactions(companyId: string, dateFrom?: string, dateTo?: string) {
  const reps = readTable<any>('salesRepresentatives');
  const partners = readTable<any>('partners');
  const rows = readTable<any>('cashMovements')
    .filter(
      (m) =>
        m.companyId === companyId &&
        m.type === 'EXPENSE' &&
        (m.sourceType === 'COMMISSION_PAYOUT' || m.sourceType === 'DIVIDEND') &&
        (!dateFrom || m.movementDate >= dateFrom) &&
        (!dateTo || m.movementDate <= dateTo),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((m) => ({
      id: m.id,
      date: m.movementDate,
      documentNumber: m.documentNumber,
      subType: m.sourceType === 'COMMISSION_PAYOUT' ? 'MANAGER' : 'PARTNER',
      name:
        m.sourceType === 'COMMISSION_PAYOUT'
          ? reps.find((r) => r.id === m.salesRepresentativeId)?.name ?? '—'
          : partners.find((p) => p.id === m.partnerId)?.name ?? '—',
      amount: Number(m.amount),
      account: m.account,
      branchId: m.branchId ?? null,
      description: m.description,
    }));
  return {
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    rows,
    total: rows.reduce((sum, r) => sum + r.amount, 0),
  };
}

// Only manually-recorded operating expenses count here — a supplier payment/purchase receipt is
// a balance-sheet cash-out-for-inventory movement, not a P&L expense; its cost only hits the P&L
// via costOfGoodsSold on the units actually sold (see buildProfitReport). Including the full
// purchase payment here too would double-count inventory that hasn't been sold yet.
/** COGS detail records for the unified Expenses screen's "تكلفة البضاعة المباعة" tab — mirrors the backend's getCogsTransactions(). */
function buildCogsTransactions(companyId: string, dateFrom?: string, dateTo?: string) {
  const customers = readTable<any>('customers');
  return readTable<any>('salesInvoices')
    .filter((i) => i.companyId === companyId && (!dateFrom || i.invoiceDate >= dateFrom) && (!dateTo || i.invoiceDate <= dateTo))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((i) => ({
      id: i.id,
      date: i.invoiceDate,
      documentNumber: i.documentNumber,
      customerName: customers.find((c) => c.id === i.customerId)?.name ?? '—',
      cogs: Number(i.costOfGoodsSold ?? 0),
    }));
}

/** = (end - start) inclusive, for 'YYYY-MM-DD' date strings — mirrors the backend's
 * daysBetweenInclusive() in employees.service.ts. */
function daysBetweenInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / 86400000) + 1;
}

/** Mirrors EmployeesService's private getMonthlyCommissions(): per-month commission earned by this
 * employee over [periodStart, periodEnd] when linked to a branch manager (SalesRepresentative row
 * with a matching userId) — zero for every month otherwise. Same exception-aware per-line rate
 * resolution as buildBranchManagersCommission/buildManagerDashboardForRep, bucketed by month. */
function buildEmployeeMonthlyCommissions(employee: any, companyId: string, periodStart: string, periodEnd: string): Map<number, number> {
  const commissionByMonth = new Map<number, number>();
  if (!employee.userId) return commissionByMonth;

  const rep = readTable<any>('salesRepresentatives').find((r) => r.userId === employee.userId && r.companyId === companyId);
  if (!rep || !rep.branchId) return commissionByMonth;

  const generalRate = Number(rep.commissionRate ?? 0);
  const products = readTable<any>('products');
  const exceptions = readTable<any>('commissionExceptions').filter(
    (e) => e.companyId === companyId && e.salesRepresentativeId === rep.id,
  );

  const invoices = readTable<any>('salesInvoices').filter(
    (i) => i.companyId === companyId && i.branchId === rep.branchId && i.invoiceDate >= periodStart && i.invoiceDate <= periodEnd,
  );
  for (const inv of invoices) {
    const month = Number(String(inv.invoiceDate).slice(5, 7));
    for (const line of inv.lines ?? []) {
      const product = products.find((p) => p.id === line.productId);
      const categoryId = product?.categoryId ?? null;
      const productException = exceptions.find((e) => e.productId === line.productId);
      const categoryException = !productException && categoryId ? exceptions.find((e) => e.categoryId === categoryId) : undefined;
      const rate = Number(productException?.commissionRate ?? categoryException?.commissionRate ?? generalRate);
      if (rate <= 0) continue;
      const commission = (Number(line.lineTotal ?? 0) * rate) / 100;
      commissionByMonth.set(month, (commissionByMonth.get(month) ?? 0) + commission);
    }
  }

  return commissionByMonth;
}

/** Mirrors EmployeesService.getHistory() — powers the employee detail panel's "بحث بالسنة/الشهر".
 * Always returns a `salary.monthly` array (1 entry when `month` is given, all 12 for the whole
 * year) plus `totals` summed across whatever months are in that array, so the caller renders the
 * same shape either way. */
function buildEmployeeHistory(employeeId: string, companyId: string, year: number, month?: number) {
  const employee = readTable<any>('employees').find((e) => e.id === employeeId && e.companyId === companyId);
  if (!employee) throw new OfflineApiError('Employee not found');
  const branches = readTable<any>('branches');
  const branch = branches.find((b) => b.id === employee.branchId) ?? null;

  const months = month ? [month] : Array.from({ length: 12 }, (_, i) => i + 1);
  const runs = readTable<any>('payrollRuns').filter(
    (r) => r.companyId === companyId && r.year === year && (!month || r.month === month),
  );
  const lines = readTable<any>('payrollRunLines');

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const periodStart = `${year}-${String(firstMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(year, lastMonth, 0).getDate();
  const periodEnd = `${year}-${String(lastMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Commission is only meaningful for months an actual payroll run exists for — added on top of
  // that run's stored deduction figures below, never shown standalone for a month with no run yet.
  const commissionByMonth = buildEmployeeMonthlyCommissions(employee, companyId, periodStart, periodEnd);

  const monthly = months.map((m) => {
    const run = runs.find((r) => r.month === m);
    const line = run ? lines.find((l) => l.payrollRunId === run.id && l.employeeId === employeeId) : null;
    if (!run || !line) {
      return {
        month: m,
        hasPayrollRun: false,
        baseSalary: 0,
        absenceDays: 0,
        lateHours: 0,
        absenceDeduction: 0,
        lateDeduction: 0,
        otherDeductions: 0,
        commission: 0,
        netSalary: 0,
        status: null as string | null,
      };
    }
    const commission = commissionByMonth.get(m) ?? 0;
    const baseSalary = Number(line.baseSalary);
    const absenceDeduction = Number(line.absenceDeduction);
    const lateDeduction = Number(line.lateDeduction);
    const otherDeductions = Number(line.otherDeductions);
    return {
      month: m,
      hasPayrollRun: true,
      baseSalary,
      absenceDays: Number(line.absenceDays),
      lateHours: Number(line.lateHours),
      absenceDeduction,
      lateDeduction,
      otherDeductions,
      commission,
      // Adds the manager's earned commission on top of the stored line figure — display-only for
      // this panel, the officially posted payroll netSalary (feeding the الرواتب expense total)
      // stays untouched.
      netSalary: Math.max(0, baseSalary - absenceDeduction - lateDeduction - otherDeductions) + commission,
      status: run.status as string,
    };
  });

  const totals = monthly.reduce(
    (acc, m) => ({
      baseSalary: acc.baseSalary + m.baseSalary,
      absenceDays: acc.absenceDays + m.absenceDays,
      lateHours: acc.lateHours + m.lateHours,
      absenceDeduction: acc.absenceDeduction + m.absenceDeduction,
      lateDeduction: acc.lateDeduction + m.lateDeduction,
      otherDeductions: acc.otherDeductions + m.otherDeductions,
      commission: acc.commission + m.commission,
      netSalary: acc.netSalary + m.netSalary,
    }),
    {
      baseSalary: 0,
      absenceDays: 0,
      lateHours: 0,
      absenceDeduction: 0,
      lateDeduction: 0,
      otherDeductions: 0,
      commission: 0,
      netSalary: 0,
    },
  );

  const overlapping = readTable<any>('employeeLeaves').filter(
    (l) => l.employeeId === employeeId && l.companyId === companyId && l.startDate <= periodEnd && l.endDate >= periodStart,
  );
  const leaveRecords = overlapping
    .map((l) => ({ id: l.id, startDate: l.startDate, endDate: l.endDate, type: l.type, notes: l.notes, days: daysBetweenInclusive(l.startDate, l.endDate) }))
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      jobTitle: employee.jobTitle,
      branchName: branch?.nameAr ?? branch?.nameEn ?? null,
      baseSalary: Number(employee.baseSalary),
      isActive: employee.isActive,
    },
    year,
    month: month ?? null,
    salary: { monthly, totals },
    leaves: { records: leaveRecords, totalDays: leaveRecords.reduce((s, r) => s + r.days, 0) },
  };
}

function buildExpenseReport(companyId: string, dateFrom?: string, dateTo?: string, branchId?: string) {
  const movements = readTable<any>('cashMovements').filter(
    (m) =>
      m.companyId === companyId &&
      m.type === 'EXPENSE' &&
      (m.sourceType === 'MANUAL' || m.sourceType === 'PAYROLL') &&
      (!dateFrom || m.movementDate >= dateFrom) &&
      (!dateTo || m.movementDate <= dateTo) &&
      (!branchId || m.branchId === branchId),
  );
  const totals = new Map<string, number>();
  for (const m of movements) {
    const label = m.category ?? m.sourceType;
    totals.set(label, (totals.get(label) ?? 0) + Number(m.amount));
  }
  const rows = [...totals.entries()].map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total);
  const totalExpenses = rows.reduce((s, r) => s + r.total, 0);
  return { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null, rows, totalExpenses };
}

/**
 * Company-wide dividend total for the period, or one partner's slice of it when `partnerId` is
 * given. `branchId` (Printing Press only) further narrows to payouts drawn from one branch —
 * mirrors the backend's getDistributedDividendsTotal().
 */
function buildDistributedDividendsTotal(
  companyId: string,
  dateFrom?: string,
  dateTo?: string,
  partnerId?: string,
  branchId?: string,
): number {
  return readTable<any>('cashMovements')
    .filter(
      (m) =>
        m.companyId === companyId &&
        m.sourceType === 'DIVIDEND' &&
        (!dateFrom || m.movementDate >= dateFrom) &&
        (!dateTo || m.movementDate <= dateTo) &&
        (!partnerId || m.partnerId === partnerId) &&
        (!branchId || m.branchId === branchId),
    )
    .reduce((sum, m) => sum + Number(m.amount ?? 0), 0);
}

/** Q1: Jan1–Mar31, Q2: Apr1–Jun30, Q3: Jul1–Sep30, Q4: Oct1–Dec31 — mirrors the backend's quarterDateRange(). */
function quarterDateRange(year: number, quarter: number): { dateFrom: string; dateTo: string } {
  if (quarter === 0) {
    return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
  }
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  const lastDay = new Date(year, endMonth, 0).getDate();
  return {
    dateFrom: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    dateTo: `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** An invoice's own attribution has a fallback beyond its exact salesRepresentativeId: the
 * combined "مندوب/مستخدم" dropdown on SalesInvoicesPage lets an invoice be assigned directly to a
 * system user (createdById) with no linked SalesRepresentative row at all — e.g. a مدير فرع whose
 * SalesRepresentative link was never synced, or an admin who picked "المستخدم" instead of
 * "المندوب" for them. Counting only exact salesRepresentativeId matches silently drops real sales
 * from that manager's reports. Mirrors the backend's r2 LEFT JOIN: only kicks in when
 * salesRepresentativeId itself is null, so an invoice with an explicit (different) rep is never
 * reattributed. `repsByUserId` must be built from every rep in the company (not just the one the
 * caller may already be filtering to), since the invoice's real owner might not be that rep. */
function resolveInvoiceRepId(inv: any, repsByUserId: Map<string, any>): string | undefined {
  if (inv.salesRepresentativeId) return inv.salesRepresentativeId;
  return inv.createdById ? repsByUserId.get(inv.createdById)?.id : undefined;
}

/**
 * Mirrors the backend's getReportsSummary(): per-representative sales volume (invoices, by
 * invoice date) and collected amount (receipts, by payment date) over a date range. A receipt is
 * attributed to whichever rep is actually known for it — its own salesRepresentativeId if set,
 * else the linked invoice's rep, else the customer's assigned rep.
 */
function buildSalesRepresentativesReport(companyId: string, dateFrom?: string, dateTo?: string, representativeId?: string) {
  const allReps = readTable<any>('salesRepresentatives').filter((r) => r.companyId === companyId);
  const reps = allReps.filter((r) => !representativeId || r.id === representativeId);
  if (reps.length === 0) return [];

  const repsByUserId = new Map(allReps.filter((r) => r.userId).map((r) => [r.userId, r]));
  const invoices = readTable<any>('salesInvoices').filter((i) => i.companyId === companyId);
  const payments = readTable<any>('salesPayments').filter((p) => p.companyId === companyId);
  const customers = readTable<any>('customers');
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const salesByRepId = new Map<string, number>();
  for (const inv of invoices) {
    const repId = resolveInvoiceRepId(inv, repsByUserId);
    if (!repId) continue;
    if (dateFrom && inv.invoiceDate < dateFrom) continue;
    if (dateTo && inv.invoiceDate > dateTo) continue;
    salesByRepId.set(repId, (salesByRepId.get(repId) ?? 0) + Number(inv.grandTotal ?? 0));
  }

  const collectedByRepId = new Map<string, number>();
  for (const p of payments) {
    if (dateFrom && p.paymentDate < dateFrom) continue;
    if (dateTo && p.paymentDate > dateTo) continue;
    const linkedInvoice = p.invoiceId ? invoiceById.get(p.invoiceId) : undefined;
    const customer = p.customerId ? customerById.get(p.customerId) : undefined;
    const repId = p.salesRepresentativeId ?? linkedInvoice?.salesRepresentativeId ?? customer?.salesRepresentativeId;
    if (!repId) continue;
    collectedByRepId.set(repId, (collectedByRepId.get(repId) ?? 0) + Number(p.amount ?? 0));
  }

  return reps.map((r) => ({
    representativeId: r.id,
    representativeName: r.name,
    salesVolume: salesByRepId.get(r.id) ?? 0,
    collectedAmount: collectedByRepId.get(r.id) ?? 0,
  }));
}

/** Mirrors the backend's getEarliestActivityYear(): the year of the company's first-ever sales
 * invoice, or the current year when it has none yet (this offline mock's company rows carry no
 * createdAt to fall back to) — company-wide, not per-manager. */
function earliestActivityYear(companyId: string): number {
  const invoiceDates = readTable<any>('salesInvoices')
    .filter((i) => i.companyId === companyId)
    .map((i) => i.invoiceDate as string)
    .sort();
  return invoiceDates.length > 0 ? new Date(invoiceDates[0]).getFullYear() : new Date().getFullYear();
}

/**
 * Mirrors the backend's getQuarterlyTrend(): totals per (year, quarter) period, covering
 * same-year quarters 1..selected (within-year trend), the same quarter in the two prior years
 * (year-over-year comparison), and the immediately preceding quarter (Q(n-1) same year, or Q4 of
 * year-1 when n=1) — backs the Printing Press-only quarterly/YoY comparison chart. `earliestYear`
 * lets the frontend skip any comparison year that predates the company's actual first activity.
 */
function buildSalesRepresentativesQuarterlyTrend(
  companyId: string,
  year: number,
  quarter: number,
  representativeId?: string,
): { periods: { year: number; quarter: number; salesVolume: number; collectedAmount: number }[]; earliestYear: number } {
  const earliestYear = earliestActivityYear(companyId);
  if (quarter < 1 || quarter > 4) return { periods: [], earliestYear };

  const periods: { year: number; quarter: number }[] = [];
  const addPeriod = (y: number, q: number) => {
    if (y < earliestYear) return;
    if (!periods.some((p) => p.year === y && p.quarter === q)) periods.push({ year: y, quarter: q });
  };
  for (let q = 1; q <= quarter; q++) addPeriod(year, q);
  addPeriod(year - 1, quarter);
  addPeriod(year - 2, quarter);
  addPeriod(quarter > 1 ? year : year - 1, quarter > 1 ? quarter - 1 : 4);

  const repsByUserId = new Map(
    readTable<any>('salesRepresentatives')
      .filter((r) => r.companyId === companyId && r.userId)
      .map((r) => [r.userId, r]),
  );
  const invoices = readTable<any>('salesInvoices').filter((i) => i.companyId === companyId);
  const payments = readTable<any>('salesPayments').filter((p) => p.companyId === companyId);
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const customers = readTable<any>('customers');
  const customerById = new Map(customers.map((c) => [c.id, c]));

  const results = periods.map((p) => {
    const { dateFrom, dateTo } = quarterDateRange(p.year, p.quarter);
    let salesVolume = 0;
    for (const inv of invoices) {
      const repId = resolveInvoiceRepId(inv, repsByUserId);
      if (!repId) continue;
      if (representativeId && repId !== representativeId) continue;
      if (inv.invoiceDate < dateFrom || inv.invoiceDate > dateTo) continue;
      salesVolume += Number(inv.grandTotal ?? 0);
    }
    let collectedAmount = 0;
    for (const pay of payments) {
      if (pay.paymentDate < dateFrom || pay.paymentDate > dateTo) continue;
      const linkedInvoice = pay.invoiceId ? invoiceById.get(pay.invoiceId) : undefined;
      const customer = pay.customerId ? customerById.get(pay.customerId) : undefined;
      const repId = pay.salesRepresentativeId ?? linkedInvoice?.salesRepresentativeId ?? customer?.salesRepresentativeId;
      if (representativeId ? repId !== representativeId : !repId) continue;
      collectedAmount += Number(pay.amount ?? 0);
    }
    return { year: p.year, quarter: p.quarter, salesVolume, collectedAmount };
  });
  return { periods: results, earliestYear };
}

/**
 * Mirrors the backend's getManagersProfitability(): revenue per manager from their own sales
 * invoices; for Press, cost = raw material purchases + operating expenses attributed via the
 * manager's own branchId (grouped by branch, same as the real backend); every other company falls
 * back to each invoice's own costOfGoodsSold with no operating expenses attributed (no branch
 * signal to attribute them by).
 */
function buildManagersProfitability(companyId: string, dateFrom: string, dateTo: string) {
  const reps = readTable<any>('salesRepresentatives').filter((r) => r.companyId === companyId);
  if (reps.length === 0) return [];

  const isPress = OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')?.id === companyId;
  const branches = readTable<any>('branches');

  const repsByUserId = new Map(reps.filter((r) => r.userId).map((r) => [r.userId, r]));
  const invoices = readTable<any>('salesInvoices').filter(
    (i) => i.companyId === companyId && i.invoiceDate >= dateFrom && i.invoiceDate <= dateTo,
  );
  const revenueByRepId = new Map<string, number>();
  const invoiceCogsByRepId = new Map<string, number>();
  for (const inv of invoices) {
    const repId = resolveInvoiceRepId(inv, repsByUserId);
    if (!repId) continue;
    revenueByRepId.set(repId, (revenueByRepId.get(repId) ?? 0) + Number(inv.grandTotal ?? 0));
    invoiceCogsByRepId.set(repId, (invoiceCogsByRepId.get(repId) ?? 0) + Number(inv.costOfGoodsSold ?? 0));
  }

  const cogsByBranchId = new Map<string, number>();
  const expensesByBranchId = new Map<string, number>();
  if (isPress) {
    const receipts = readTable<any>('purchaseReceipts').filter(
      (r) => r.companyId === companyId && r.receiptDate >= dateFrom && r.receiptDate <= dateTo && r.branchId,
    );
    for (const r of receipts) {
      cogsByBranchId.set(r.branchId, (cogsByBranchId.get(r.branchId) ?? 0) + Number(r.totalAmount ?? 0));
    }

    const movements = readTable<any>('cashMovements').filter(
      (m) =>
        m.companyId === companyId &&
        m.type === 'EXPENSE' &&
        m.sourceType === 'MANUAL' &&
        m.movementDate >= dateFrom &&
        m.movementDate <= dateTo &&
        m.branchId,
    );
    for (const m of movements) {
      expensesByBranchId.set(m.branchId, (expensesByBranchId.get(m.branchId) ?? 0) + Number(m.amount ?? 0));
    }
  }

  return reps.map((r) => {
    const revenue = revenueByRepId.get(r.id) ?? 0;
    const cogs = isPress ? (r.branchId ? cogsByBranchId.get(r.branchId) ?? 0 : 0) : invoiceCogsByRepId.get(r.id) ?? 0;
    const operatingExpenses = isPress && r.branchId ? expensesByBranchId.get(r.branchId) ?? 0 : 0;
    const netProfit = revenue - cogs - operatingExpenses;
    const branch = r.branchId ? branches.find((b) => b.id === r.branchId) : null;
    return {
      representativeId: r.id,
      representativeName: r.name,
      branchName: branch ? branch.nameAr || branch.nameEn : null,
      salesVolume: revenue,
      netProfit,
      profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    };
  });
}

/**
 * Mirrors the backend's getBranchManagersCommission(): each branch's total sales for the period ×
 * its assigned manager's commissionRate — attributed to the branch itself (SalesInvoice.branchId),
 * never to whoever actually created each invoice. One row per branch, even one with no assigned
 * manager or no sales in the period (zeros), so the report needs no per-invoice manager selection.
 *
 * commissionAmount is computed per invoice line (not totalSales × generalRate), since a manager's
 * commissionExceptions can override the rate for a specific product or product category — a line's
 * rate is its product-specific exception, else its category's exception, else the manager's own
 * general commissionRate. totalSales stays SUM(lineTotal), same figure grandTotal always equals
 * (no header-level tax/discount on sales invoices in this system). Lines live embedded on each
 * salesInvoices row (`inv.lines`), not a separate table — no join needed, just a products lookup
 * for each line's categoryId.
 */
function buildBranchManagersCommission(companyId: string, dateFrom: string, dateTo: string) {
  const branches = readTable<any>('branches').filter((b) => b.companyId === companyId);
  const reps = readTable<any>('salesRepresentatives').filter((r) => r.companyId === companyId);
  const products = readTable<any>('products');
  const invoices = readTable<any>('salesInvoices').filter(
    (i) => i.companyId === companyId && i.branchId && i.invoiceDate >= dateFrom && i.invoiceDate <= dateTo,
  );
  const exceptions = readTable<any>('commissionExceptions').filter((e) => e.companyId === companyId);

  const linesByBranchId = new Map<string, { lineTotal: number; productId: string; categoryId: string | null }[]>();
  for (const inv of invoices) {
    if (!linesByBranchId.has(inv.branchId)) linesByBranchId.set(inv.branchId, []);
    const bucket = linesByBranchId.get(inv.branchId)!;
    for (const line of inv.lines ?? []) {
      const product = products.find((p) => p.id === line.productId);
      bucket.push({
        lineTotal: Number(line.lineTotal ?? 0),
        productId: line.productId,
        categoryId: product?.categoryId ?? null,
      });
    }
  }

  return branches
    .map((b) => {
      const manager = reps.find((r) => r.branchId === b.id) ?? null;
      const generalRate = Number(manager?.commissionRate ?? 0);
      const managerExceptions = manager ? exceptions.filter((e) => e.salesRepresentativeId === manager.id) : [];
      const lines = linesByBranchId.get(b.id) ?? [];

      let totalSales = 0;
      let commissionAmount = 0;
      for (const line of lines) {
        const productException = managerExceptions.find((e) => e.productId === line.productId);
        const categoryException =
          !productException && line.categoryId
            ? managerExceptions.find((e) => e.categoryId === line.categoryId)
            : undefined;
        const rate = Number(productException?.commissionRate ?? categoryException?.commissionRate ?? generalRate);
        totalSales += line.lineTotal;
        commissionAmount += (line.lineTotal * rate) / 100;
      }

      return {
        branchId: b.id,
        branchName: b.nameAr || b.nameEn || null,
        managerId: manager?.id ?? null,
        managerName: manager?.name ?? null,
        totalSales,
        commissionRate: generalRate,
        commissionAmount,
      };
    })
    .sort((a, b) => b.commissionAmount - a.commissionAmount);
}

/**
 * Mirrors SalesRepresentativesService.getManagerDashboard(): a logged-in branch manager's own
 * sales/commission for the given date range (scoped to their own branch only, same exception-aware
 * math as buildBranchManagersCommission), plus their current/previous calendar month payroll
 * snapshot — independent of the date range, since payroll is always run monthly.
 */
function buildManagerDashboard(companyId: string, dateFrom?: string, dateTo?: string) {
  const userId = getOfflineSessionUser()?.id;
  const rep = readTable<any>('salesRepresentatives').find((r) => r.userId === userId && r.companyId === companyId);
  if (!rep) throw new OfflineApiError('لا يوجد سجل مدير فرع مرتبط بحسابك');
  return buildManagerDashboardForRep(rep, companyId, dateFrom, dateTo);
}

/** Admin drill-down mirror of the backend's getManagerDashboardByRepId(): same computation, keyed
 * by the SalesRepresentative's own id instead of resolving it from the logged-in session. */
function buildManagerDashboardByRepId(companyId: string, repId: string, dateFrom?: string, dateTo?: string) {
  const rep = readTable<any>('salesRepresentatives').find((r) => r.id === repId && r.companyId === companyId);
  if (!rep) throw new OfflineApiError('مدير الفرع غير موجود');
  return buildManagerDashboardForRep(rep, companyId, dateFrom, dateTo);
}

/** Mirrors SalesRepresentativesService.monthsInDateRange(): the 3 (year, month) pairs a
 * quarter-shaped [dateFrom, dateTo] spans, walked forward from dateFrom's own (year, month). */
function monthsInOfflineDateRange(dateFrom: string): { year: number; month: number }[] {
  const [y, m] = dateFrom.split('-').map(Number);
  return [0, 1, 2].map((i) => {
    const d = new Date(y, m - 1 + i, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
}

function buildManagerDashboardForRep(rep: any, companyId: string, dateFrom?: string, dateTo?: string) {
  const branches = readTable<any>('branches');
  const products = readTable<any>('products');
  const invoices = readTable<any>('salesInvoices').filter(
    (i) =>
      i.companyId === companyId &&
      i.branchId === rep.branchId &&
      (!dateFrom || i.invoiceDate >= dateFrom) &&
      (!dateTo || i.invoiceDate <= dateTo),
  );
  const exceptions = readTable<any>('commissionExceptions').filter(
    (e) => e.companyId === companyId && e.salesRepresentativeId === rep.id,
  );

  // Only lines this manager actually earns a commission on ever reach the dashboard — a resolved
  // rate of 0% (no general rate and no exception, or an exception explicitly zeroing it out) means
  // this sale isn't "his" for commission purposes, so it's excluded from both the sales list AND
  // totalSales, not just from the commission total.
  const generalRate = Number(rep.commissionRate ?? 0);
  let totalSales = 0;
  let commissionAmount = 0;
  const items: {
    lineId: string;
    invoiceId: string;
    documentNumber: string;
    invoiceDate: string;
    productName: string;
    lineTotal: number;
    commissionRate: number;
    commissionAmount: number;
  }[] = [];
  for (const inv of invoices) {
    for (const line of inv.lines ?? []) {
      const product = products.find((p) => p.id === line.productId);
      const categoryId = product?.categoryId ?? null;
      const productException = exceptions.find((e) => e.productId === line.productId);
      const categoryException =
        !productException && categoryId ? exceptions.find((e) => e.categoryId === categoryId) : undefined;
      const rate = Number(productException?.commissionRate ?? categoryException?.commissionRate ?? generalRate);
      if (rate <= 0) continue;
      const lineTotal = Number(line.lineTotal ?? 0);
      const lineCommission = (lineTotal * rate) / 100;
      totalSales += lineTotal;
      commissionAmount += lineCommission;
      items.push({
        lineId: line.id ?? `${inv.id}-${line.productId}`,
        invoiceId: inv.id,
        documentNumber: inv.documentNumber,
        invoiceDate: inv.invoiceDate,
        productName: product?.nameAr || product?.nameEn || '—',
        lineTotal,
        commissionRate: rate,
        commissionAmount: lineCommission,
      });
    }
  }
  items.sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : 0));

  const employee = rep.userId
    ? readTable<any>('employees').find((e) => e.userId === rep.userId && e.companyId === companyId)
    : undefined;

  function payrollSnapshot(year: number, month: number) {
    if (!employee) return null;
    const run = readTable<any>('payrollRuns').find((r) => r.companyId === companyId && r.year === year && r.month === month);
    if (!run) return null;
    const line = readTable<any>('payrollRunLines').find((l) => l.payrollRunId === run.id && l.employeeId === employee.id);
    if (!line) return null;
    return {
      year,
      month,
      baseSalary: Number(line.baseSalary),
      absenceDays: Number(line.absenceDays),
      lateHours: Number(line.lateHours),
      absenceDeduction: Number(line.absenceDeduction),
      lateDeduction: Number(line.lateDeduction),
      otherDeductions: Number(line.otherDeductions),
      totalDeductions: Number(line.absenceDeduction) + Number(line.lateDeduction) + Number(line.otherDeductions),
      netSalary: Number(line.netSalary),
      status: run.status,
    };
  }

  const branch = branches.find((b) => b.id === rep.branchId);
  const months = dateFrom ? monthsInOfflineDateRange(dateFrom) : [];

  return {
    manager: { id: rep.id, name: rep.name, branchName: branch ? branch.nameAr || branch.nameEn || null : null },
    employee: employee ? { baseSalary: Number(employee.baseSalary), jobTitle: employee.jobTitle } : null,
    sales: { totalSales, items },
    commission: { generalRate, amount: commissionAmount },
    payroll: {
      hasEmployeeRecord: !!employee,
      months: months.map((m) => payrollSnapshot(m.year, m.month)),
    },
  };
}

/** Mirrors the backend's getReportsInvoices(): same population and date range as buildSalesRepresentativesReport's sales-volume side, so the table always reconciles with the chart. */
function buildSalesRepresentativesInvoices(companyId: string, dateFrom?: string, dateTo?: string, representativeId?: string) {
  const customers = readTable<any>('customers');
  const repsByUserId = new Map(
    readTable<any>('salesRepresentatives')
      .filter((r) => r.companyId === companyId && r.userId)
      .map((r) => [r.userId, r]),
  );
  return readTable<any>('salesInvoices')
    .filter((inv) => {
      if (inv.companyId !== companyId) return false;
      if (dateFrom && inv.invoiceDate < dateFrom) return false;
      if (dateTo && inv.invoiceDate > dateTo) return false;
      const repId = resolveInvoiceRepId(inv, repsByUserId);
      return representativeId ? repId === representativeId : !!repId;
    })
    .map((inv) => ({
      id: inv.id,
      documentNumber: inv.documentNumber,
      invoiceDate: inv.invoiceDate,
      grandTotal: Number(inv.grandTotal ?? 0),
      status: inv.status,
      customerName: customers.find((c) => c.id === inv.customerId)?.name ?? '—',
    }))
    .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : 0));
}

/** Mirrors the backend's getReportsReceipts(): same fallback attribution chain as buildSalesRepresentativesReport's collected-amount side, so the table always reconciles with the chart. */
function buildSalesRepresentativesReceipts(companyId: string, dateFrom?: string, dateTo?: string, representativeId?: string) {
  const invoices = readTable<any>('salesInvoices');
  const customers = readTable<any>('customers');
  const invoiceById = new Map(invoices.map((i) => [i.id, i]));
  const customerById = new Map(customers.map((c) => [c.id, c]));

  return readTable<any>('salesPayments')
    .filter((p) => {
      if (p.companyId !== companyId) return false;
      if (dateFrom && p.paymentDate < dateFrom) return false;
      if (dateTo && p.paymentDate > dateTo) return false;
      const linkedInvoice = p.invoiceId ? invoiceById.get(p.invoiceId) : undefined;
      const customer = p.customerId ? customerById.get(p.customerId) : undefined;
      const repId = p.salesRepresentativeId ?? linkedInvoice?.salesRepresentativeId ?? customer?.salesRepresentativeId;
      return representativeId ? repId === representativeId : !!repId;
    })
    .map((p) => ({
      id: p.id,
      documentNumber: p.documentNumber,
      paymentDate: p.paymentDate,
      amount: Number(p.amount ?? 0),
      method: p.method,
      customerName: customerById.get(p.customerId)?.name ?? '—',
    }))
    .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : a.paymentDate > b.paymentDate ? -1 : 0));
}

/** Printing Press never issues stock for its catalog sales, so its sales invoices' costOfGoodsSold
 * is always 0 — mirrors the backend's CashMovementsService.getRawMaterialPurchasesTotal(): Press's
 * real COGS is what it spent on raw material purchase receipts in the period, the same total shown
 * on the Expenses screen's "إجمالي مشتريات المواد الخام" tab. */
function buildRawMaterialPurchasesTotal(companyId: string, dateFrom?: string, dateTo?: string, branchId?: string): number {
  return readTable<any>('purchaseReceipts')
    .filter(
      (r) =>
        r.companyId === companyId &&
        (!dateFrom || r.receiptDate >= dateFrom) &&
        (!dateTo || r.receiptDate <= dateTo) &&
        (!branchId || r.branchId === branchId),
    )
    .reduce((sum, r) => sum + Number(r.totalAmount ?? 0), 0);
}

/**
 * Printing Performance Report's "إجمالي المواد المستهلكة" card and material-consumption ratio —
 * mirrors the backend's CashMovementsService.getConsumedMaterialsTotal(): summed from approved
 * Monthly Stock Audits only ("جرد شهري" — see the stock-audits handler above), using the exact
 * same `(systemQuantity - finalQuantity) * unitCost` per-line formula as hydrateAudit()'s
 * totalConsumedValue. A CONFIRMED (not yet approved) audit hasn't actually adjusted stock yet, so
 * it's excluded — only APPROVED counts as real consumption. `branchId` narrows this to one branch
 * via the audit's warehouse (Warehouse.branchId). Returns 0 (never NaN) when nothing matches.
 */
function buildConsumedMaterialsTotal(companyId: string, dateFrom?: string, dateTo?: string, branchId?: string): number {
  const warehouses = readTable<any>('warehouses');
  const audits = readTable<any>('stockAudits').filter(
    (a) =>
      a.companyId === companyId &&
      a.status === 'APPROVED' &&
      (!dateFrom || a.auditDate >= dateFrom) &&
      (!dateTo || a.auditDate <= dateTo) &&
      (!branchId || warehouses.find((w) => w.id === a.warehouseId)?.branchId === branchId),
  );
  const lines = readTable<any>('stockAuditLines');
  return audits.reduce((sum, audit) => {
    const auditLines = lines.filter((l) => l.auditId === audit.id);
    return (
      sum +
      auditLines.reduce((lineSum: number, l: any) => {
        if (l.actualQuantity === null || l.actualQuantity === undefined) return lineSum;
        const finalQuantity = Number(l.adjustedQuantity ?? l.actualQuantity);
        const consumed = Number(l.systemQuantity) - finalQuantity;
        return lineSum + consumed * Number(l.unitCost);
      }, 0)
    );
  }, 0);
}

/**
 * `branchId` (Printing Press only) narrows Revenue/COGS/Expenses to one branch: Revenue via the
 * invoice's own branchId column (set directly at creation — see the POST /sales/invoices handler
 * above — not via a join through its optional salesRepresentativeId, which is frequently unset
 * for a Press invoice and would silently zero out revenue for a branch the filter is applied to;
 * mirrors the real backend's getProfitReport() fix), COGS via PurchaseReceipt.branchId, and
 * operating expenses via CashMovement.branchId.
 */
function buildProfitReport(companyId: string, dateFrom?: string, dateTo?: string, branchId?: string) {
  const invoices = readTable<any>('salesInvoices').filter(
    (i) =>
      i.companyId === companyId &&
      (!dateFrom || i.invoiceDate >= dateFrom) &&
      (!dateTo || i.invoiceDate <= dateTo) &&
      (!branchId || i.branchId === branchId),
  );
  const isPress = OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')?.id === companyId;
  const revenue = invoices.reduce((s, i) => s + Number(i.subtotal ?? 0), 0);
  const cogs = isPress
    ? buildRawMaterialPurchasesTotal(companyId, dateFrom, dateTo, branchId)
    : invoices.reduce((s, i) => s + Number(i.costOfGoodsSold ?? 0), 0);
  const consumedMaterials = isPress ? buildConsumedMaterialsTotal(companyId, dateFrom, dateTo, branchId) : 0;
  const grossProfit = revenue - cogs;
  const { rows: expenses, totalExpenses } = buildExpenseReport(companyId, dateFrom, dateTo, branchId);
  const netProfit = grossProfit - totalExpenses;
  const distributedDividends = buildDistributedDividendsTotal(companyId, dateFrom, dateTo, undefined, branchId);
  return {
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    revenue,
    cogs,
    consumedMaterials,
    grossProfit,
    expenses,
    totalExpenses,
    netProfit,
    distributedDividends,
    expenseBreakdown: {
      cogs,
      operatingExpenses: totalExpenses,
      total: cogs + totalExpenses,
    },
  };
}

/**
 * Mirrors the backend's getPrintingPerformanceTrend(): net profit and material-consumption ratio
 * (approved Monthly Stock Audits' consumed materials ÷ revenue) per quarter, same period set as
 * buildSalesRepresentativesQuarterlyTrend (this quarter's own same-year quarters, the same quarter
 * the prior two years, and the immediately preceding quarter) and the same earliestActivityYear()
 * guard, computed straight from buildProfitReport() for each period so it can never disagree with
 * the Profit Report tab.
 */
function buildPrintingPerformanceTrend(companyId: string, year: number, quarter: number, branchId?: string) {
  const earliestYear = earliestActivityYear(companyId);
  if (quarter < 1 || quarter > 4) return { periods: [], earliestYear };

  const periods: { year: number; quarter: number }[] = [];
  const addPeriod = (y: number, q: number) => {
    if (y < earliestYear) return;
    if (!periods.some((p) => p.year === y && p.quarter === q)) periods.push({ year: y, quarter: q });
  };
  // Always the full 4 quarters of the selected year (not just up to the currently-selected
  // quarter) so the chart's X-axis is always one continuous, complete year.
  for (let q = 1; q <= 4; q++) addPeriod(year, q);
  addPeriod(year - 1, quarter);
  addPeriod(year - 2, quarter);
  addPeriod(quarter > 1 ? year : year - 1, quarter > 1 ? quarter - 1 : 4);

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const results = periods.map((p) => {
    const { dateFrom, dateTo } = quarterDateRange(p.year, p.quarter);
    const report = buildProfitReport(companyId, dateFrom, dateTo, branchId);
    const materialCostRatio = report.revenue > 0 ? (report.consumedMaterials / report.revenue) * 100 : 0;
    return { year: p.year, quarter: p.quarter, netProfit: round2(report.netProfit), materialCostRatio: round2(materialCostRatio) };
  });
  return { periods: results, earliestYear };
}

// ---------------------------------------------------------------------------
// Error type — carries a `.response.data.message` shape like a real AxiosError
// ---------------------------------------------------------------------------

export class OfflineApiError extends Error {
  response: { data: { message: string } };
  constructor(message: string) {
    super(message);
    this.response = { data: { message } };
  }
}

// ---------------------------------------------------------------------------
// Route table
// ---------------------------------------------------------------------------

type Method = 'get' | 'post' | 'patch' | 'delete';

function findOne<T extends { id: string }>(table: string, id: string): T {
  const row = readTable<T>(table).find((r) => r.id === id);
  if (!row) throw new OfflineApiError('Not found');
  return row;
}

function genericList(table: string) {
  return readTable<any>(table);
}

function genericCreate(table: string, body: any, extra: Record<string, unknown> = {}) {
  const rows = readTable<any>(table);
  const row = { id: genId(), isActive: true, ...body, ...extra };
  rows.push(row);
  writeTable(table, rows);
  return row;
}

function genericDelete(table: string, id: string) {
  const rows = readTable<any>(table);
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) throw new OfflineApiError('Not found');
  writeTable(table, next);
  return { deleted: true };
}

function buildCustomerStatement(customerId: string) {
  const customer = findOne<any>('customers', customerId);
  const invoices = readTable<any>('salesInvoices').filter((i) => i.customerId === customerId);
  const payments = readTable<any>('salesPayments').filter((p) => p.customerId === customerId);

  const lines = [
    ...invoices.map((i) => ({ date: i.invoiceDate, type: 'Sales Invoice', documentNumber: i.documentNumber, debit: i.grandTotal, credit: 0, _t: i.invoiceDate })),
    ...payments.map((p) => ({ date: p.paymentDate, type: 'Payment', documentNumber: p.documentNumber, debit: 0, credit: p.amount, _t: p.paymentDate })),
  ].sort((a, b) => (a._t < b._t ? -1 : a._t > b._t ? 1 : 0));

  let balance = customer.openingBalance ?? 0;
  const withRunning = lines.map((l) => {
    balance += l.debit - l.credit;
    const { _t, ...rest } = l;
    return { ...rest, runningBalance: balance };
  });

  return {
    customer: { code: customer.code, name: customer.name },
    openingBalance: customer.openingBalance ?? 0,
    closingBalance: balance,
    lines: withRunning,
  };
}

/**
 * Mirrors the backend's loadCustomerInvoices(): each invoice's paid/remaining amount is summed
 * live from the ACTUAL linked sales_payments rows rather than trusted from `invoice.amountPaid` —
 * that field is normally kept in sync as each payment is recorded, but a stored/cached number like
 * that has no way to self-heal if a write path ever misses it. Computing it from the real payments
 * table on every read means this can never disagree with the receipts log shown alongside it.
 *
 * Receipts recorded against the customer but not tied to any specific invoice (a "دفعة تحت
 * الحساب" / on-account payment, invoiceId === null) still reduce what the customer actually owes,
 * so they're applied here against the customer's oldest open invoices first (FIFO) until
 * exhausted. Without this, sum(remainingAmount) across invoices would overstate the customer's
 * true balance by exactly the total of their on-account receipts, disagreeing with
 * totalInvoiced - totalReceipts (buildCustomerOutstandingTotal below uses that same subtraction).
 */
function buildCustomerInvoices(customerId: string) {
  const products = readTable<any>('products');
  const reps = readTable<any>('salesRepresentatives');
  const payments = readTable<any>('salesPayments');
  const users = readTable<any>('users');
  const customer = readTable<any>('customers').find((c) => c.id === customerId);
  const customerRepName = customer?.salesRepresentativeId
    ? reps.find((r) => r.id === customer.salesRepresentativeId)?.name ?? null
    : null;
  const invoices = readTable<any>('salesInvoices')
    .filter((i) => i.customerId === customerId)
    .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : 0));

  const directAmountByInvoiceId = new Map<string, number>();
  for (const inv of invoices) {
    const paid = payments
      .filter((p) => p.invoiceId === inv.id)
      .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
    directAmountByInvoiceId.set(inv.id, paid);
  }

  let freeCredit = payments
    .filter((p) => p.customerId === customerId && !p.invoiceId)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  const appliedFreeCreditByInvoiceId = new Map<string, number>();
  const oldestFirst = [...invoices].sort((a, b) => (a.invoiceDate < b.invoiceDate ? -1 : a.invoiceDate > b.invoiceDate ? 1 : 0));
  for (const inv of oldestFirst) {
    if (freeCredit <= 0.005) break;
    const openAmount = Number(inv.grandTotal ?? 0) - (directAmountByInvoiceId.get(inv.id) ?? 0);
    if (openAmount <= 0.005) continue;
    const applied = Math.min(openAmount, freeCredit);
    appliedFreeCreditByInvoiceId.set(inv.id, applied);
    freeCredit -= applied;
  }

  return invoices.map((inv) => {
    const amountPaid =
      (directAmountByInvoiceId.get(inv.id) ?? 0) + (appliedFreeCreditByInvoiceId.get(inv.id) ?? 0);
    return {
      id: inv.id,
      documentNumber: inv.documentNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate ?? null,
      grandTotal: Number(inv.grandTotal ?? 0),
      amountPaid,
      remainingAmount: Number(inv.grandTotal ?? 0) - amountPaid,
      salesRepresentativeName:
        (inv.salesRepresentativeId ? reps.find((r) => r.id === inv.salesRepresentativeId)?.name : null) ??
        customerRepName ??
        users.find((u) => u.id === inv.createdById)?.fullName ??
        null,
      lines: (inv.lines ?? []).map((l: any) => ({
        productName: products.find((p) => p.id === l.productId)?.nameEn ?? '—',
        quantity: Number(l.quantity ?? 0),
        unitPrice: Number(l.unitPrice ?? 0),
        lineTotal: Number(l.lineTotal ?? 0),
      })),
    };
  });
}

/**
 * Total outstanding customer balance as it stood at the end of a given period — every invoice
 * dated on or before `asOfDate` minus every payment dated on or before `asOfDate`, mirroring the
 * backend's getOutstandingTotal(). Backs the Partners > Dividends screen's "الأرصدة المستحقة"
 * card, which needs the balance as of the selected quarter/year, not today's live figure.
 */
function buildCustomerOutstandingTotal(companyId?: string, asOfDate?: string): number {
  const invoiceTotal = readTable<any>('salesInvoices')
    .filter((i) => (!companyId || i.companyId === companyId) && i.status !== 'CANCELLED')
    .filter((i) => !asOfDate || i.invoiceDate <= asOfDate)
    .reduce((sum, i) => sum + Number(i.grandTotal ?? 0), 0);
  const paymentTotal = readTable<any>('salesPayments')
    .filter((p) => !companyId || p.companyId === companyId)
    .filter((p) => !asOfDate || p.paymentDate <= asOfDate)
    .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  return invoiceTotal - paymentTotal;
}

function buildSalesLinesReport(
  companyId?: string,
  dateFrom?: string,
  dateTo?: string,
  branchId?: string | null,
) {
  const products = readTable<any>('products');
  const packageTypes = readTable<any>('packageTypes');
  const reps = readTable<any>('salesRepresentatives');
  const customers = readTable<any>('customers');
  const effectiveBranchId = resolveOfflineBranchId(branchId);
  const invoices = readTable<any>('salesInvoices')
    .filter((i) => !companyId || i.companyId === companyId)
    .filter((i) => !dateFrom || i.invoiceDate >= dateFrom)
    .filter((i) => !dateTo || i.invoiceDate <= dateTo)
    .filter((i) => {
      if (!effectiveBranchId) return true;
      const rep = i.salesRepresentativeId ? reps.find((r) => r.id === i.salesRepresentativeId) : null;
      return rep?.branchId === effectiveBranchId;
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const rows: any[] = [];
  for (const inv of invoices) {
    const repName = inv.salesRepresentativeId
      ? reps.find((r) => r.id === inv.salesRepresentativeId)?.name ?? null
      : null;
    const customerName = customers.find((c) => c.id === inv.customerId)?.name ?? null;
    const invoiceGrandTotal = Number(inv.grandTotal ?? 0);
    const invoiceAmountPaid = Number(inv.amountPaid ?? 0);
    for (const l of inv.lines ?? []) {
      const product = products.find((p) => p.id === l.productId);
      const lineTotal = Number(l.lineTotal ?? 0);
      // Payments are recorded against the invoice as a whole, never per line, so a line's own
      // paid/due split is a proration of the invoice's overall paid amount.
      const paidAmount = invoiceGrandTotal > 0 ? (lineTotal / invoiceGrandTotal) * invoiceAmountPaid : 0;
      rows.push({
        id: l.id,
        invoiceDate: inv.invoiceDate,
        productName: product?.nameEn ?? '—',
        productType: product?.productType ?? 'RAW_MATERIAL',
        baseQuantity: Number(l.baseQuantity ?? 0),
        unitsPerPackage: product?.unitsPerPackage ? Number(product.unitsPerPackage) : null,
        packageTypeName: product?.packageTypeId
          ? packageTypes.find((pt) => pt.id === product.packageTypeId)?.nameEn ?? null
          : null,
        salesRepresentativeName: repName,
        customerName,
        lineTotal,
        // The actual weighted-average stock cost at time of sale, mirroring the backend — this is
        // what reconciles with the invoice's own costOfGoodsSold total, not the catalog purchase price.
        costOfGoodsSold: Number(l.unitCost ?? 0) * Number(l.baseQuantity ?? 0),
        totalProfit: Number(l.totalProfit ?? 0),
        paidAmount,
        dueAmount: lineTotal - paidAmount,
      });
    }
  }

  return rows;
}

/**
 * Mirrors PartnersService's server-side rule: the combined share across every partner in the same
 * cap-table scope (excluding the one being edited) can never exceed 100%. For every company but
 * Printing Press that scope is the whole company (branchId always null/undefined there); Printing
 * Press splits the cap table per branch, so each branch gets its own independent 100%.
 */
function assertPartnerShareWithinLimit(
  companyId: string,
  sharePercentage: number,
  branchId?: string | null,
  excludeId?: string,
): void {
  const partners = readTable<any>('partners').filter(
    (p) => p.id !== excludeId && p.companyId === companyId && (p.branchId ?? null) === (branchId ?? null),
  );
  const currentTotal = partners.reduce((sum, p) => sum + Number(p.sharePercentage ?? 0), 0);
  const projectedTotal = currentTotal + sharePercentage;
  if (projectedTotal > 100) {
    throw new OfflineApiError(
      `Total partner share would be ${projectedTotal.toFixed(2)}%, which exceeds 100% (current total: ${currentTotal.toFixed(2)}%).`,
    );
  }
}

function buildCashLedger(companyId: string, branchId?: string) {
  // Mirrors CashMovementsService.getLedger(): excludes a capital injection's BANK-tagged memo row
  // (sourceId set, pointing at its linked CASH row) — that linked CASH row already represents the
  // real movement in the general ledger, so listing (and summing) both would double-count the same
  // contribution. Printing Press's single-row contributions (no sourceId) are real, standalone
  // movements and must stay visible.
  const movements = readTable<any>('cashMovements').filter(
    (m) =>
      m.companyId === companyId &&
      !(m.account === 'BANK' && m.sourceType === 'CAPITAL_INJECTION' && m.sourceId) &&
      (!branchId || m.branchId === branchId),
  );
  const customers = readTable<any>('customers');
  const suppliers = readTable<any>('suppliers');

  const rows = movements
    .map((m) => {
      const customer = m.partyCustomerId ? customers.find((c) => c.id === m.partyCustomerId) : null;
      const supplier = m.partySupplierId ? suppliers.find((s) => s.id === m.partySupplierId) : null;
      return {
        date: m.movementDate,
        movementType: m.sourceType,
        documentNumber: m.documentNumber,
        partyName: customer?.name ?? supplier?.companyName ?? m.category ?? null,
        paymentAccount: m.account as 'CASH' | 'BANK',
        debit: m.type === 'INCOME' ? Number(m.amount) : 0,
        credit: m.type === 'EXPENSE' ? Number(m.amount) : 0,
        description: m.description,
        createdAt: m.createdAt,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));

  let runningBalance = 0;
  const withBalance = rows.map((r) => {
    runningBalance += r.debit - r.credit;
    const { createdAt, ...rest } = r;
    return { ...rest, runningBalance };
  });
  return withBalance.reverse();
}

/**
 * `branchId` (Printing Press only — the Dashboard's Branch filter) narrows every card to one
 * branch: sales/revenue via the invoice/payment's sales representative's branch (mirrors
 * dashboard.service.ts's getSummary()), purchases via PurchaseReceipt.branchId, inventory value
 * via Warehouse.branchId, and the cash/bank treasury balances via CashMovement.branchId.
 * Omitted/undefined means every branch combined — identical to today's behavior.
 */
function buildDashboardSummary(companyId: string, branchId?: string) {
  const reps = readTable<any>('salesRepresentatives');
  const repBranchById = new Map(reps.map((r) => [r.id, r.branchId]));
  const invoicesAllBranches = readTable<any>('salesInvoices').filter((i) => i.companyId === companyId);
  const invoices = invoicesAllBranches.filter(
    (i) => !branchId || repBranchById.get(i.salesRepresentativeId) === branchId,
  );
  const paymentsAllBranches = readTable<any>('salesPayments').filter((p) => p.companyId === companyId);
  const payments = paymentsAllBranches.filter(
    (p) => !branchId || repBranchById.get(p.salesRepresentativeId) === branchId,
  );
  const customers = readTable<any>('customers').filter((c) => c.companyId === companyId);
  const warehouses = readTable<any>('warehouses');
  const warehouseBranchById = new Map(warehouses.map((w) => [w.id, w.branchId]));
  const stockLevels = readTable<any>('stockLevels')
    .filter((l) => l.companyId === companyId)
    .filter((l) => !branchId || warehouseBranchById.get(l.warehouseId) === branchId);
  const todayStr = today();
  const monthPrefix = todayStr.slice(0, 7);

  const dailySales = invoices.filter((i) => i.invoiceDate === todayStr).reduce((s, i) => s + i.grandTotal, 0);
  // Printing Press: accrual-basis revenue — the FULL value of every invoice issued this month,
  // matching exactly what the Sales Chart and Sales Invoices log both total for the same branch
  // (both read straight off salesInvoices, never off salesPayments). Filtered by the invoice's own
  // branchId column directly, not through the salesRepresentativeId join `invoices` above uses —
  // that join silently zeroes this for walk-in invoices with no rep (mirrors dashboard.service.ts).
  //
  // Every other company keeps the original cash-basis figure: only actual customer payments
  // collected this month (paid up front at invoice creation or collected later against
  // outstanding debt — both paths create a salesPayments row), never unpaid/credit invoice totals.
  const isPress = OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')?.id === companyId;
  const monthlyRevenue = isPress
    ? invoicesAllBranches
        .filter(
          (i) =>
            i.invoiceDate.startsWith(monthPrefix) &&
            i.status !== 'CANCELLED' &&
            (!branchId || i.branchId === branchId),
        )
        .reduce((s, i) => s + Number(i.grandTotal ?? 0), 0)
    : payments.filter((p) => p.paymentDate.startsWith(monthPrefix)).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const inventoryValue = stockLevels.reduce((s, l) => s + l.quantityOnHand * l.averageCost, 0);

  const todaysInvoices = invoices.filter((i) => i.invoiceDate === todayStr);
  const profitToday = todaysInvoices.reduce(
    (s, i) => s + (Number(i.subtotal ?? 0) - Number(i.costOfGoodsSold ?? 0)),
    0,
  );

  // Outstanding customer balances have no branch concept (Printing Press has no customer
  // receivables management at all) — always company-wide, unaffected by the branch filter.
  const paidByCustomer = new Map<string, number>();
  for (const p of paymentsAllBranches) paidByCustomer.set(p.customerId, (paidByCustomer.get(p.customerId) ?? 0) + p.amount);
  const outstandingCustomerBalances = customers.reduce((sum, c) => {
    const invoiced = invoicesAllBranches.filter((i) => i.customerId === c.id).reduce((s, i) => s + i.grandTotal, 0);
    const paid = paidByCustomer.get(c.id) ?? 0;
    return sum + (c.openingBalance ?? 0) + invoiced - paid;
  }, 0);

  const receipts = readTable<any>('purchaseReceipts')
    .filter((r) => r.companyId === companyId)
    .filter((r) => !branchId || r.branchId === branchId);
  const dailyPurchases = receipts
    .filter((r) => r.receiptDate === todayStr)
    .reduce((s, r) => s + Number(r.totalAmount ?? 0), 0);

  return {
    dailySales,
    dailyPurchases,
    cashBalance: cashBalance(companyId, 'CASH', todayStr, branchId),
    bankBalance: cashBalance(companyId, 'BANK', todayStr, branchId),
    profitToday,
    monthlyRevenue,
    monthlyExpenses: buildExpenseReport(companyId, `${monthPrefix}-01`, todayStr, branchId).totalExpenses,
    outstandingCustomerBalances,
    inventoryValue,
  };
}

function buildTopSellingProducts(companyId: string) {
  const invoices = readTable<any>('salesInvoices').filter((i) => i.companyId === companyId);
  const products = readTable<any>('products').filter((p) => p.companyId === companyId);
  const totals = new Map<string, { totalQuantity: number; totalRevenue: number }>();
  for (const inv of invoices) {
    for (const line of inv.lines ?? []) {
      const t = totals.get(line.productId) ?? { totalQuantity: 0, totalRevenue: 0 };
      t.totalQuantity += line.quantity;
      t.totalRevenue += line.lineTotal;
      totals.set(line.productId, t);
    }
  }
  return [...totals.entries()]
    .map(([productId, t]) => ({ productId, name: products.find((p) => p.id === productId)?.nameEn ?? productId, ...t }))
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .slice(0, 5);
}

function buildRecentTransactions(companyId: string) {
  const invoices = readTable<any>('salesInvoices')
    .filter((i) => i.companyId === companyId)
    .map((i) => ({ type: 'Sales Invoice', documentNumber: i.documentNumber, date: i.invoiceDate, amount: i.grandTotal, createdAt: i.createdAt }));
  const payments = readTable<any>('salesPayments')
    .filter((p) => p.companyId === companyId)
    .map((p) => ({ type: 'Payment', documentNumber: p.documentNumber, date: p.paymentDate, amount: p.amount, createdAt: p.createdAt }));
  return [...invoices, ...payments]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10)
    .map(({ createdAt, ...rest }) => rest);
}

// `branchId` (Printing Press only — the Dashboard's Branch filter) narrows this to one branch via
// the invoice's own branchId column — the same source buildDashboardSummary()'s Press-only
// monthlyRevenue reads, so this chart's total for a period always matches the "إيرادات الشهر"
// card and the Sales Invoices log for that period/branch.
function buildSalesChart(companyId: string, branchId?: string) {
  const invoices = readTable<any>('salesInvoices').filter(
    (i) => i.companyId === companyId && (!branchId || i.branchId === branchId),
  );
  const byDate = new Map<string, number>();
  for (const inv of invoices) byDate.set(inv.invoiceDate, (byDate.get(inv.invoiceDate) ?? 0) + inv.grandTotal);
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, total]) => ({ date, total }));
}

// ---------------------------------------------------------------------------
// Offline login: resolves a seeded/created user by email and derives their permissions from
// their assigned role(s), so the Manager role (and any other role) can actually be logged into
// and exercised in the browser, not just the fixed demo Administrator account.
// ---------------------------------------------------------------------------

export interface OfflineAuthUser {
  id: string;
  phone: string;
  email?: string | null;
  fullName: string;
  companyId: string;
  branchId: string;
  permissions: string[];
  isSystemRole: boolean;
  /** True for a true Administrator — implicit access to every company; companyIds is irrelevant for them. */
  allCompanies: boolean;
  /** The companies this user may access/switch into (ignored when allCompanies is true). */
  companyIds: string[];
}

/** Mirrors AuthService.extractCompanyIds() on the real backend: an Administrator has implicit
 * access to every company (no ACL rows needed); everyone else is limited to whatever
 * `userCompanies` rows exist for them. */
function resolveAccessibleCompanyIds(userId: string, isSystemRole: boolean): { allCompanies: boolean; companyIds: string[] } {
  if (isSystemRole) return { allCompanies: true, companyIds: [] };
  const links = readTable<any>('userCompanies').filter((l) => l.userId === userId);
  return { allCompanies: false, companyIds: links.map((l) => l.companyId) };
}

export function resolveOfflineUser(phone: string): OfflineAuthUser | null {
  ensureSeeded();
  const users = readTable<any>('users');
  const roles = readTable<any>('roles');
  // Trimmed the same way the real backend's login() trims — an accidental leading/trailing space
  // typed into the phone field must never be the difference between finding the account or not.
  const trimmedPhone = phone.trim();
  const user = users.find((u) => u.phone === trimmedPhone);
  if (!user || user.isActive === false) return null;

  const assignedRoles = (user.roles ?? []).map((assigned: any) => roles.find((r) => r.id === assigned.id) ?? assigned);
  const permissions = Array.from(
    new Set(assignedRoles.flatMap((role: any) => role.permissions ?? [])),
  ) as string[];
  const isSystemRole = assignedRoles.some((role: any) => role.isSystemRole === true);
  const { allCompanies, companyIds } = resolveAccessibleCompanyIds(user.id, isSystemRole);

  // Mirrors AuthService.issueTokens(): a non-admin with zero accessible companies can't log in at
  // all, and one whose stored active companyId fell outside their allowed set (e.g. an admin
  // unassigned it, or it was never set) gets re-anchored to a company they actually hold an ACL row for.
  if (!allCompanies) {
    if (!companyIds.length) {
      throw new OfflineApiError('This account is not assigned to any company. Contact your administrator.');
    }
    if (!user.companyId || !companyIds.includes(user.companyId)) {
      user.companyId = companyIds[0];
      const mainBranch = readTable<any>('branches').find((b) => b.companyId === user.companyId && b.isMainBranch);
      const fallbackBranch = mainBranch ?? readTable<any>('branches').find((b) => b.companyId === user.companyId);
      user.branchId = fallbackBranch?.id ?? null;
      writeTable('users', users);
    }
  }

  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    companyId: user.companyId ?? OFFLINE_COMPANY_ID,
    branchId: user.branchId ?? OFFLINE_BRANCH_ID,
    permissions,
    isSystemRole,
    allCompanies,
    companyIds,
  };
}

/**
 * The companies the caller may pick from in the company picker/switcher — mirrors
 * AuthService.getAccessibleCompanies(). Reads the CURRENT offline session directly (there's no
 * request-scoped auth context in this mock), same as getOfflineSessionUser().
 */
export function getOfflineAccessibleCompanies(): any[] {
  const sessionUser = getOfflineSessionUser();
  if (!sessionUser) return [];
  const companies = readTable<any>('companies').filter((c) => c.isActive !== false);
  if (sessionUser.allCompanies) return companies;
  return companies.filter((c) => sessionUser.companyIds?.includes(c.id));
}

/**
 * Switches the caller's active company in place — mirrors AuthService.switchCompany(): rejects
 * any target the caller isn't a true Administrator for and doesn't hold a userCompanies ACL row
 * for, regardless of what the client claims.
 */
export function switchOfflineCompanyRequest(targetCompanyId: string): { accessToken: string; user: OfflineAuthUser } {
  const sessionUser = getOfflineSessionUser();
  if (!sessionUser) throw new OfflineApiError('Not logged in');

  const targetCompany = readTable<any>('companies').find((c) => c.id === targetCompanyId);
  if (!targetCompany) throw new OfflineApiError('Company not found');

  if (!sessionUser.allCompanies && !sessionUser.companyIds?.includes(targetCompanyId)) {
    throw new OfflineApiError('You do not have access to this company');
  }

  const users = readTable<any>('users');
  const user = users.find((u) => u.id === sessionUser.id);
  if (!user) throw new OfflineApiError('User not found');

  const mainBranch = readTable<any>('branches').find((b) => b.companyId === targetCompanyId && b.isMainBranch);
  const fallbackBranch = mainBranch ?? readTable<any>('branches').find((b) => b.companyId === targetCompanyId);
  user.companyId = targetCompanyId;
  user.branchId = fallbackBranch?.id ?? null;
  writeTable('users', users);

  const updatedUser = resolveOfflineUser(user.phone);
  if (!updatedUser) throw new OfflineApiError('User not found');
  // Mirrors auth-store.ts's OFFLINE_TOKEN constant — duplicated as a literal rather than imported
  // to keep this file dependency-free (it's a standalone browser-only mock, imported by
  // api-client.ts, not the other way around).
  return { accessToken: 'offline-demo-token', user: updatedUser };
}

/**
 * Self-service "Account Settings" password change — mirrors AuthService.changePassword()'s old-
 * password check. `/auth/*` is deliberately excluded from api-client.ts's generic offline
 * fallback (see the comment there), so this is called directly from the frontend mutation when
 * accessToken === OFFLINE_TOKEN, the same way Topbar.tsx's company-switch mutation already
 * branches to switchOfflineCompanyRequest() instead of a real POST. This offline demo never stores
 * real per-user credentials (every account logs in with the one shared OFFLINE_DEMO_PASSWORD — see
 * LoginPage.tsx), so "old password" is checked against that shared constant rather than a per-user
 * hash; there is nothing further to persist since login doesn't consult a per-user password either.
 */
export function changeOfflinePassword(oldPassword: string, newPassword: string): { changed: true } {
  if (!getOfflineSessionUser()) throw new OfflineApiError('Not logged in');
  // Trimmed the same way the real AuthService.changePassword() trims before verifying/hashing.
  if (oldPassword.trim() !== OFFLINE_DEMO_PASSWORD) throw new OfflineApiError('Old password is incorrect');
  if (newPassword.trim().length < 8) throw new OfflineApiError('Password must be at least 8 characters');
  return { changed: true };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Reads the currently logged-in offline session's user, straight from localStorage (there's no request-scoped auth context in this mock). */
function getOfflineSessionUser(): OfflineAuthUser | null {
  const sessionRaw = localStorage.getItem(STORAGE_PREFIX + 'session');
  if (!sessionRaw) return null;
  try {
    return JSON.parse(sessionRaw)?.user ?? null;
  } catch {
    return null;
  }
}

/**
 * Mirrors UsersService.findOneScoped()/update()/remove() on the real backend: a user outside the
 * caller's active company session is treated as not found — same rule as the list filter above,
 * so editing/deleting can't be used to reach a user the caller can't even see, by direct id —
 * unless the CALLER is themselves a true Administrator (isSystemRole), who, same as they already
 * see every user regardless of active company in the list, can also edit/delete any of them
 * without first switching into whichever company that user happens to be scoped to.
 */
function assertOfflineUserVisibleToSession(user: any): void {
  const sessionUser = getOfflineSessionUser();
  if (user.roles?.some((r: any) => r.isSystemRole)) return;
  if (sessionUser?.isSystemRole) return;
  const links = readTable<any>('userCompanies').filter((l) => l.userId === user.id);
  if (!links.some((l) => l.companyId === sessionUser?.companyId)) {
    throw new OfflineApiError('Not found');
  }
}

/**
 * Mirrors the real backend's cascading UsersService.remove(): permanently deletes a user AND every
 * business record they created — quotations (plain delete, no stock/cash effect), sales invoices
 * (reverses issued stock line by line, deletes their own payments+cash movements), standalone sales
 * payments not tied to one of those invoices (reverses the target invoice's amountPaid/status if it
 * still exists, deletes the linked cash movement), purchase receipts (reverses received stock,
 * deletes the linked cash movement) and stock audits (reverses the stock delta if APPROVED) — same
 * reasoning as each entity's own real-backend remove()/cancel(): createdById is a plain audit
 * column, not a real relation, so nothing here is enforced by any schema constraint; only actually
 * reversing each side effect keeps stock levels and treasury balances correct after the account and
 * its footprint are gone. Payroll runs are intentionally NOT covered here — this offline mock's
 * payroll approve/reverse logic lives deep inside its own PATCH handler, not a standalone callable
 * function, and Manager-role accounts have never been the ones creating/approving payroll runs in
 * either the demo data or the real seed, so this gap has no practical case to hit today.
 */
function cascadeDeleteOfflineUserRecords(userId: string): void {
  // Quotations: plain delete, no stock/cash side effects (mirrors QuotationsService.remove()).
  const quotations = readTable<any>('quotations');
  writeTable(
    'quotations',
    quotations.filter((q) => q.createdById !== userId),
  );

  // Sales invoices this user created: reverse each line's issued stock (skipping CATALOG_ITEM,
  // which never had stock issued), then remove their own payments + linked cash movements.
  const products = readTable<any>('products');
  const invoices = readTable<any>('salesInvoices');
  const myInvoices = invoices.filter((i) => i.createdById === userId);
  const myInvoiceIds = new Set(myInvoices.map((i) => i.id));
  for (const invoice of myInvoices) {
    for (const line of invoice.lines ?? []) {
      const product = products.find((p) => p.id === line.productId);
      if (product?.productType === 'CATALOG_ITEM') continue;
      receiveStock(
        line.productId,
        invoice.warehouseId,
        Number(line.baseQuantity),
        Number(line.unitCost),
        'USER_DELETE',
        invoice.documentNumber,
      );
    }
  }
  const allPaymentsBeforeInvoiceCleanup = readTable<any>('salesPayments');
  const paymentsOnMyInvoices = allPaymentsBeforeInvoiceCleanup.filter((p) => myInvoiceIds.has(p.invoiceId));
  if (paymentsOnMyInvoices.length) {
    const movementIdsFromMyInvoices = new Set(paymentsOnMyInvoices.map((p) => p.cashMovementId).filter(Boolean));
    writeTable(
      'cashMovements',
      readTable<any>('cashMovements').filter((m) => !movementIdsFromMyInvoices.has(m.id)),
    );
    writeTable(
      'salesPayments',
      allPaymentsBeforeInvoiceCleanup.filter((p) => !myInvoiceIds.has(p.invoiceId)),
    );
  }
  writeTable(
    'salesInvoices',
    invoices.filter((i) => !myInvoiceIds.has(i.id)),
  );

  // Standalone sales payments this user recorded (including ones against an invoice created by
  // someone else, so not covered by the invoice loop above). Anything already removed as part of
  // this user's own invoices above is gone from the table already, so this only ever touches the
  // remainder.
  const remainingPayments = readTable<any>('salesPayments').filter((p) => p.createdById === userId);
  for (const payment of remainingPayments) {
    if (payment.invoiceId) {
      const invoicesNow = readTable<any>('salesInvoices');
      const invoice = invoicesNow.find((i) => i.id === payment.invoiceId);
      if (invoice) {
        const remaining = Math.max(0, Number(invoice.amountPaid) - Number(payment.amount));
        invoice.amountPaid = remaining;
        invoice.status =
          remaining <= 0 ? 'CONFIRMED' : remaining < Number(invoice.grandTotal) ? 'PARTIALLY_PAID' : 'PAID';
        writeTable('salesInvoices', invoicesNow);
      }
    }
    if (payment.cashMovementId) {
      writeTable(
        'cashMovements',
        readTable<any>('cashMovements').filter((m) => m.id !== payment.cashMovementId),
      );
    }
  }
  writeTable(
    'salesPayments',
    readTable<any>('salesPayments').filter((p) => p.createdById !== userId),
  );

  // Purchase receipts this user recorded: reverse the received stock, remove the linked cash
  // movement, then remove the receipt itself.
  const receipts = readTable<any>('purchaseReceipts');
  const myReceipts = receipts.filter((r) => r.createdById === userId);
  for (const receipt of myReceipts) {
    issueStock(receipt.productId, receipt.warehouseId, Number(receipt.totalUnits), 'USER_DELETE', receipt.documentNumber, 'PURCHASE_RETURN');
  }
  if (myReceipts.length) {
    const myReceiptIds = new Set(myReceipts.map((r) => r.id));
    writeTable(
      'cashMovements',
      readTable<any>('cashMovements').filter((m) => !(m.sourceType === 'PURCHASE_RECEIPT' && myReceiptIds.has(m.sourceId))),
    );
  }
  writeTable(
    'purchaseReceipts',
    receipts.filter((r) => r.createdById !== userId),
  );

  // Stock audits this user created: reverse the stock delta only if it was ever APPROVED (a
  // CONFIRMED-only audit never touched real stock) — same negated-delta approach as the audit's
  // own DELETE handler.
  const audits = readTable<any>('stockAudits');
  const myAudits = audits.filter((a) => a.createdById === userId);
  const allAuditLines = readTable<any>('stockAuditLines');
  for (const audit of myAudits) {
    if (audit.status !== 'APPROVED') continue;
    const counted = allAuditLines.filter((l) => l.auditId === audit.id && l.actualQuantity !== null);
    for (const line of counted) {
      const appliedQuantity = line.adjustedQuantity ?? line.actualQuantity;
      const reverseDelta = Number(line.systemQuantity) - Number(appliedQuantity);
      if (reverseDelta === 0) continue;
      if (reverseDelta > 0) {
        receiveStock(line.productId, audit.warehouseId, reverseDelta, Number(line.unitCost), 'STOCK_ADJUSTMENT', 'USER_DELETE');
      } else {
        const level = getOrCreateStockLevel(line.productId, audit.warehouseId);
        level.quantityOnHand += reverseDelta;
        saveStockLevel(level);
        addMovement({
          productId: line.productId,
          warehouseId: audit.warehouseId,
          type: 'ADJUSTMENT_OUT',
          quantity: Math.abs(reverseDelta),
          unitCost: Number(line.unitCost),
          totalCost: Math.abs(reverseDelta) * Number(line.unitCost),
          balanceQuantityAfter: level.quantityOnHand,
          balanceAverageCostAfter: level.averageCost,
          referenceType: 'STOCK_ADJUSTMENT',
          referenceNumber: 'USER_DELETE',
        });
      }
    }
  }
  const myAuditIds = new Set(myAudits.map((a) => a.id));
  writeTable(
    'stockAudits',
    audits.filter((a) => !myAuditIds.has(a.id)),
  );
  writeTable(
    'stockAuditLines',
    allAuditLines.filter((l) => !myAuditIds.has(l.auditId)),
  );

  // userCompanies rows and any salesRepresentative link to this user — mirrors the real backend's
  // FK cascade (onDelete: 'CASCADE') / set-null (onDelete: 'SET NULL') behavior respectively.
  writeTable(
    'userCompanies',
    readTable<any>('userCompanies').filter((l) => l.userId !== userId),
  );
  const reps = readTable<any>('salesRepresentatives');
  let repsChanged = false;
  for (const rep of reps) {
    if (rep.userId === userId) {
      rep.userId = null;
      repsChanged = true;
    }
  }
  if (repsChanged) writeTable('salesRepresentatives', reps);
}

/**
 * Mirrors SalesRepAccessService.resolveSalesRepresentativeId() on the real backend: a non-admin
 * can never assign a quotation/payment to any sales representative but their own — whatever
 * salesRepresentativeId the client sent is ignored outright unless the caller is the true
 * Administrator.
 */
function resolveOfflineSalesRepId(requestedId: string | null | undefined): string | null {
  const sessionUser = getOfflineSessionUser();
  if (sessionUser?.isSystemRole) return requestedId ?? null;
  const reps = readTable<any>('salesRepresentatives');
  const ownRep = reps.find((r) => r.userId === sessionUser?.id);
  return ownRep?.id ?? null;
}

/** Mirrors SalesRepAccessService.resolveBranchId(): a non-admin's "الفرع" filter (Sales report)
 * is always pinned to their own sales rep's branch, ignoring whatever branchId the client sent. */
function resolveOfflineBranchId(requestedBranchId: string | null | undefined): string | null {
  const sessionUser = getOfflineSessionUser();
  if (sessionUser?.isSystemRole) return requestedBranchId ?? null;
  const reps = readTable<any>('salesRepresentatives');
  const ownRep = reps.find((r) => r.userId === sessionUser?.id);
  return ownRep?.branchId ?? null;
}

/** Same idea as resolveOfflineSalesRepId, but for sales invoices' combined rep-or-owner field. */
function resolveOfflineInvoiceOwner(requested: {
  salesRepresentativeId?: string | null;
  createdById?: string | null;
}): { salesRepresentativeId: string | null; createdById: string } {
  const sessionUser = getOfflineSessionUser();
  const callerId = sessionUser?.id ?? '';
  if (sessionUser?.isSystemRole) {
    return {
      salesRepresentativeId: requested.salesRepresentativeId ?? null,
      createdById: requested.createdById || callerId,
    };
  }
  const reps = readTable<any>('salesRepresentatives');
  const ownRep = reps.find((r) => r.userId === callerId);
  return { salesRepresentativeId: ownRep?.id ?? null, createdById: callerId };
}

export function resolveOfflineRequest(method: Method, path: string, params: Record<string, any>, body: any): any {
  ensureSeeded();

  const parts = path.replace(/^\/+/, '').split('/');
  const [seg0, seg1, seg2, seg3, seg4] = parts;

  // --- System ----------------------------------------------------------------------
  if (seg0 === 'system' && seg1 === 'factory-reset' && method === 'post') {
    // Mirrors the real backend's two extra layers on top of the frontend's own tab-hiding (see
    // SettingsPage.tsx): re-check the caller is really the Administrator/Super-Admin, then
    // re-verify the fixed reset code, independent of whether their session is merely still
    // logged in. Deliberately NOT the offline demo login password (OFFLINE_DEMO_PASSWORD) — same
    // as the real backend, this is a fixed code independent of any admin's real password, so
    // changing the demo login password never breaks this. See SystemService.factoryReset() /
    // FactoryResetTab.tsx's own RESET_CODE for the matching real-backend constant.
    const sessionUser = getOfflineSessionUser();
    if (!sessionUser?.isSystemRole) {
      throw new OfflineApiError('Only the Administrator / Super Admin role can perform a factory reset');
    }
    const RESET_CODE = '0145';
    if (body?.password !== RESET_CODE) {
      throw new OfflineApiError('Incorrect password');
    }
    return factoryResetDemoData();
  }

  // --- Customers -----------------------------------------------------------
  if (seg0 === 'customers') {
    const customersCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg1 === 'outstanding-total' && !seg2 && method === 'get') {
      return buildCustomerOutstandingTotal(customersCompanyId, params?.asOfDate);
    }
    if (seg1 && seg2 === 'statement' && method === 'get') return buildCustomerStatement(seg1);
    if (!seg1 && method === 'get') {
      // Total purchases is always derived live from salesInvoices, never stored on the customer
      // row — a cached total would go stale the moment an invoice is added through any path that
      // forgets to update it, which is exactly the "شركة سمارت" bug this replaces.
      const invoices = readTable<any>('salesInvoices');
      const paymentsForTotals = readTable<any>('salesPayments');
      const reps = readTable<any>('salesRepresentatives');
      const users = readTable<any>('users');
      return genericList('customers')
        .filter((c: any) => c.companyId === customersCompanyId)
        .map((c: any) => {
        const customerInvoices = invoices.filter((i) => i.customerId === c.id);
        const totalPurchases = customerInvoices.reduce((sum, i) => sum + Number(i.grandTotal ?? 0), 0);
        const totalPaid = paymentsForTotals
          .filter((p) => p.customerId === c.id)
          .reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
        // Falls back to the rep recorded on the customer's most recent invoice when no rep is
        // directly assigned to the customer record itself.
        const latestInvoiceWithRep = [...customerInvoices]
          .filter((i) => i.salesRepresentativeId)
          .sort((a, b) => (a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : 0))[0];
        const repId = c.salesRepresentativeId ?? latestInvoiceWithRep?.salesRepresentativeId ?? null;
        // Final fallback: the employee who created the customer's most recent invoice at all
        // (regardless of whether that invoice has a rep), used when neither the customer nor any
        // of its invoices has a rep attached — so the column never falls back to an empty dash
        // just because no rep was ever chosen.
        const latestInvoice = [...customerInvoices].sort((a, b) =>
          a.invoiceDate < b.invoiceDate ? 1 : a.invoiceDate > b.invoiceDate ? -1 : 0,
        )[0];
        const creatorName = latestInvoice
          ? users.find((u) => u.id === latestInvoice.createdById)?.fullName ?? null
          : null;
        const salesRepresentativeName = (repId ? reps.find((r) => r.id === repId)?.name ?? null : null) ?? creatorName;
        return {
          ...c,
          totalPurchases,
          totalPaid,
          balanceDue: Number(c.openingBalance ?? 0) + totalPurchases - totalPaid,
          salesRepresentativeName,
        };
      });
    }
    if (seg1 && seg2 === 'outstanding-invoices' && method === 'get') {
      return buildCustomerInvoices(seg1).filter((inv) => inv.grandTotal - inv.amountPaid > 0.005);
    }
    if (seg1 && seg2 === 'invoices' && method === 'get') {
      return buildCustomerInvoices(seg1);
    }
    if (!seg1 && method === 'post') {
      const code = body.code || tryGetNextNumber('CUSTOMER') || `CUST-${Date.now()}`;
      return genericCreate('customers', body, {
        companyId: customersCompanyId,
        code,
        openingBalance: body.openingBalance ?? 0,
      });
    }
    if (seg1 && !seg2 && method === 'patch') {
      const rows = readTable<any>('customers');
      const row = rows.find((r) => r.id === seg1 && r.companyId === customersCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      Object.assign(row, body, { companyId: customersCompanyId });
      writeTable('customers', rows);
      return row;
    }
    if (seg1 && !seg2 && method === 'delete') return genericDelete('customers', seg1);
  }

  // --- Installment sales (عقد تقسيط) -----------------------------------------
  if (seg0 === 'installments') {
    const sessionUser = getOfflineSessionUser();
    const companyId = sessionUser?.companyId ?? OFFLINE_COMPANY_ID;
    const createdById = sessionUser?.id ?? 'offline-demo-user';

    if (!seg1 && method === 'get') {
      const plans = readTable<any>('installmentPlans').filter((p) => p.companyId === companyId);
      const customers = readTable<any>('customers');
      const items = readTable<any>('installmentScheduleItems');
      const payments = readTable<any>('installmentPayments');
      return plans
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((plan) => {
          const planItems = items.filter((i) => i.installmentPlanId === plan.id);
          const planPayments = payments.filter((p) => p.installmentPlanId === plan.id);
          const views = buildInstallmentScheduleViews(plan, planItems, planPayments);
          const remainingBalance = round4(views.reduce((s, v) => s + v.remaining, 0));
          const nextDue = views.find((v) => v.status !== 'PAID');
          return {
            id: plan.id,
            documentNumber: plan.documentNumber,
            customerId: plan.customerId,
            customerName: customers.find((c) => c.id === plan.customerId)?.name ?? '—',
            purchaseDate: plan.purchaseDate,
            totalPayable: Number(plan.totalPayable),
            installmentAmount: Number(plan.installmentAmount),
            remainingBalance,
            nextDueDate: nextDue?.dueDate ?? null,
            status: plan.status,
          };
        });
    }

    if (seg1 === 'reports' && seg2 === 'summary' && method === 'get') {
      const plans = readTable<any>('installmentPlans').filter((p) => p.companyId === companyId && p.status === 'ACTIVE');
      const items = readTable<any>('installmentScheduleItems').filter((i) => plans.some((p) => p.id === i.installmentPlanId));
      const payments = readTable<any>('installmentPayments').filter((p) => plans.some((pl) => pl.id === p.installmentPlanId));
      const totalDue = items.reduce((s, i) => s + Number(i.amountDue), 0);
      const totalPaid = payments.filter((p) => p.scheduleItemId).reduce((s, p) => s + Number(p.amount), 0);
      return { totalOutstanding: round4(totalDue - totalPaid) };
    }

    if (seg1 === 'reports' && seg2 === 'expected-cash-flow' && method === 'get') {
      const plans = readTable<any>('installmentPlans').filter((p) => p.companyId === companyId && p.status === 'ACTIVE');
      let items = readTable<any>('installmentScheduleItems').filter((i) => plans.some((p) => p.id === i.installmentPlanId));
      if (params?.dateFrom) items = items.filter((i) => i.dueDate >= params.dateFrom);
      if (params?.dateTo) items = items.filter((i) => i.dueDate <= params.dateTo);
      const byPeriod = new Map<string, number>();
      for (const i of items) {
        const period = String(i.dueDate).slice(0, 7);
        byPeriod.set(period, round4((byPeriod.get(period) ?? 0) + Number(i.amountDue)));
      }
      return [...byPeriod.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, expected]) => ({ period, expected }));
    }

    if (seg1 === 'reports' && seg2 === 'interest-profit' && method === 'get') {
      const plans = readTable<any>('installmentPlans').filter((p) => p.companyId === companyId);
      const activePlanIds = new Set(plans.filter((p) => p.status === 'ACTIVE').map((p) => p.id));
      let allPayments = readTable<any>('installmentPayments').filter((p) => plans.some((pl) => pl.id === p.installmentPlanId));
      if (params?.dateFrom) allPayments = allPayments.filter((p) => p.paymentDate >= params.dateFrom);
      if (params?.dateTo) allPayments = allPayments.filter((p) => p.paymentDate <= params.dateTo);
      const realizedInterest = round4(allPayments.reduce((s, p) => s + Number(p.interestAllocated ?? 0), 0));

      const activeItems = readTable<any>('installmentScheduleItems').filter((i) => activePlanIds.has(i.installmentPlanId));
      const totalInterestDue = activeItems.reduce((s, i) => s + Number(i.interestPortion), 0);
      const paidInterest = readTable<any>('installmentPayments')
        .filter((p) => activePlanIds.has(p.installmentPlanId))
        .reduce((s, p) => s + Number(p.interestAllocated ?? 0), 0);
      return { realizedInterest, remainingInterest: round4(totalInterestDue - paidInterest) };
    }

    if (seg1 && !seg2 && method === 'get') {
      const plan = readTable<any>('installmentPlans').find((p) => p.id === seg1 && p.companyId === companyId);
      if (!plan) throw new OfflineApiError('Installment plan not found');
      const customers = readTable<any>('customers');
      const warehouses = readTable<any>('warehouses');
      const products = readTable<any>('products');
      const lines = readTable<any>('installmentPlanLines')
        .filter((l) => l.installmentPlanId === plan.id)
        .map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) ?? null }));
      const items = readTable<any>('installmentScheduleItems')
        .filter((i) => i.installmentPlanId === plan.id)
        .sort((a, b) => a.installmentNumber - b.installmentNumber);
      const payments = readTable<any>('installmentPayments').filter((p) => p.installmentPlanId === plan.id);
      const schedule = buildInstallmentScheduleViews(plan, items, payments);
      const downPayment = payments.find((p) => p.paymentType === 'DOWN_PAYMENT');
      return {
        plan: {
          ...plan,
          customer: customers.find((c) => c.id === plan.customerId) ?? null,
          warehouse: warehouses.find((w) => w.id === plan.warehouseId) ?? null,
          lines,
        },
        schedule,
        downPaymentAmount: downPayment ? Number(downPayment.amount) : 0,
        payments,
      };
    }

    if (!seg1 && method === 'post') {
      const customers = readTable<any>('customers');
      const customer = customers.find((c) => c.id === body.customerId);
      if (!customer || customer.companyId !== companyId) throw new OfflineApiError('Customer not found');
      if (customer.creditStatus === 'BLOCKED') {
        throw new OfflineApiError(customer.blockedReason || 'هذا العميل محظور من عقود التقسيط الجديدة');
      }

      const documentNumber = nextDocNumber('installmentPlans', 'INSTL');
      const products = readTable<any>('products');
      let totalPrice = 0;
      const lineRows: any[] = [];
      for (const line of body.lines ?? []) {
        const unitCost = issueStock(line.productId, body.warehouseId, Number(line.quantity), 'INSTALLMENT_PLAN', documentNumber, 'SALES_ISSUE');
        const lineTotal = round4(Number(line.quantity) * Number(line.unitPrice));
        totalPrice = round4(totalPrice + lineTotal);
        lineRows.push({
          id: genId(),
          installmentPlanId: '',
          productId: line.productId,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          lineTotal,
          unitCost,
          productName: products.find((p) => p.id === line.productId)?.nameEn ?? '—',
        });
      }

      if (Number(body.downPayment) > totalPrice) {
        throw new OfflineApiError('الدفعة المقدمة أكبر من إجمالي سعر السلعة');
      }

      const terms = computeInstallmentTerms(
        totalPrice,
        Number(body.downPayment),
        body.interestType,
        Number(body.interestRate),
        Number(body.tenureMonths),
      );

      const planId = genId();
      const plan = {
        id: planId,
        documentNumber,
        companyId,
        customerId: body.customerId,
        warehouseId: body.warehouseId,
        purchaseDate: body.purchaseDate,
        downPayment: Number(body.downPayment),
        interestType: body.interestType,
        interestRate: Number(body.interestRate),
        tenureMonths: Number(body.tenureMonths),
        financedPrincipal: terms.financedPrincipal,
        totalInterestAmount: terms.totalInterestAmount,
        totalPayable: terms.totalPayable,
        installmentAmount: terms.installmentAmount,
        status: 'ACTIVE',
        settledAt: null,
        settlementDiscountAmount: null,
        settlementNotes: null,
        createdById,
        createdAt: new Date().toISOString(),
      };
      const plans = readTable<any>('installmentPlans');
      plans.push(plan);
      writeTable('installmentPlans', plans);

      const allLines = readTable<any>('installmentPlanLines');
      for (const l of lineRows) allLines.push({ ...l, installmentPlanId: planId });
      writeTable('installmentPlanLines', allLines);

      const scheduleInputs = generateInstallmentSchedule(body.purchaseDate, terms, Number(body.tenureMonths));
      const allItems = readTable<any>('installmentScheduleItems');
      for (const s of scheduleInputs) allItems.push({ id: genId(), installmentPlanId: planId, ...s });
      writeTable('installmentScheduleItems', allItems);

      if (Number(body.downPayment) > 0) {
        const movement = recordCashMovement({
          companyId,
          movementDate: body.purchaseDate,
          type: 'INCOME',
          account: 'CASH',
          amount: Number(body.downPayment),
          sourceType: 'INSTALLMENT_PAYMENT',
          sourceId: planId,
          partyCustomerId: body.customerId,
          description: `Down payment ${documentNumber}`,
          createdById,
        });
        const payments = readTable<any>('installmentPayments');
        payments.push({
          id: genId(),
          documentNumber: nextDocNumber('installmentPayments', 'INSTLP'),
          installmentPlanId: planId,
          scheduleItemId: null,
          paymentType: 'DOWN_PAYMENT',
          amount: Number(body.downPayment),
          principalAllocated: Number(body.downPayment),
          interestAllocated: 0,
          paymentDate: body.purchaseDate,
          method: 'CASH',
          cashMovementId: movement.id,
          companyId,
          createdById,
        });
        writeTable('installmentPayments', payments);
      }

      return plan;
    }

    if (seg1 && seg2 === 'schedule' && seg3 && seg4 === 'payments' && method === 'post') {
      const plan = readTable<any>('installmentPlans').find((p) => p.id === seg1 && p.companyId === companyId);
      if (!plan) throw new OfflineApiError('Installment plan not found');
      if (plan.status !== 'ACTIVE') throw new OfflineApiError('لا يمكن تسجيل دفعة على عقد غير نشط');
      const items = readTable<any>('installmentScheduleItems');
      const item = items.find((i) => i.id === seg3 && i.installmentPlanId === seg1);
      if (!item) throw new OfflineApiError('Schedule item not found');

      const amount = Number(body.amount);
      const account = body.method === 'CASH' ? 'CASH' : 'BANK';
      const movement = recordCashMovement({
        companyId,
        movementDate: body.paymentDate,
        type: 'INCOME',
        account,
        amount,
        sourceType: 'INSTALLMENT_PAYMENT',
        sourceId: plan.id,
        partyCustomerId: plan.customerId,
        description: `Installment #${item.installmentNumber} payment ${plan.documentNumber}`,
        createdById,
      });

      const itemAmountDue = Number(item.amountDue) || 1;
      const interestAllocated = round4(amount * (Number(item.interestPortion) / itemAmountDue));
      const principalAllocated = round4(amount - interestAllocated);
      const allPayments = readTable<any>('installmentPayments');
      const payment = {
        id: genId(),
        documentNumber: nextDocNumber('installmentPayments', 'INSTLP'),
        installmentPlanId: plan.id,
        scheduleItemId: item.id,
        paymentType: 'INSTALLMENT',
        amount,
        principalAllocated,
        interestAllocated,
        paymentDate: body.paymentDate,
        method: body.method,
        cashMovementId: movement.id,
        companyId,
        createdById,
      };
      allPayments.push(payment);
      writeTable('installmentPayments', allPayments);

      // Mark the plan COMPLETED once every schedule item is fully paid.
      const planItems = items.filter((i) => i.installmentPlanId === plan.id);
      const views = buildInstallmentScheduleViews(plan, planItems, allPayments.filter((p) => p.installmentPlanId === plan.id));
      if (views.every((v) => v.status === 'PAID')) {
        const plans = readTable<any>('installmentPlans');
        const planRow = plans.find((p) => p.id === plan.id);
        if (planRow) {
          planRow.status = 'COMPLETED';
          writeTable('installmentPlans', plans);
        }
      }

      return payment;
    }

    if (seg1 && seg2 === 'settle-early' && method === 'post') {
      const plans = readTable<any>('installmentPlans');
      const plan = plans.find((p) => p.id === seg1 && p.companyId === companyId);
      if (!plan) throw new OfflineApiError('Installment plan not found');
      if (plan.status !== 'ACTIVE') throw new OfflineApiError('لا يمكن التسوية المبكرة لعقد غير نشط');

      const items = readTable<any>('installmentScheduleItems').filter((i) => i.installmentPlanId === plan.id);
      const existingPayments = readTable<any>('installmentPayments').filter((p) => p.installmentPlanId === plan.id);
      const views = buildInstallmentScheduleViews(plan, items, existingPayments);

      let remainingPrincipal = 0;
      let remainingInterest = 0;
      for (const view of views) {
        if (view.remaining <= 0.005) continue;
        const ratio = view.remaining / view.amountDue;
        remainingPrincipal = round4(remainingPrincipal + view.principalPortion * ratio);
        remainingInterest = round4(remainingInterest + view.interestPortion * ratio);
      }

      const discount = round4(
        body.discountAmount ?? (body.discountPercent ? remainingInterest * (Number(body.discountPercent) / 100) : 0),
      );
      if (discount > remainingInterest) throw new OfflineApiError('قيمة الخصم أكبر من إجمالي الفوائد المتبقية');
      const finalAmount = round4(remainingPrincipal + remainingInterest - discount);

      if (finalAmount > 0.005) {
        const account = body.method === 'CASH' ? 'CASH' : 'BANK';
        const movement = recordCashMovement({
          companyId,
          movementDate: body.settlementDate,
          type: 'INCOME',
          account,
          amount: finalAmount,
          sourceType: 'INSTALLMENT_PAYMENT',
          sourceId: plan.id,
          partyCustomerId: plan.customerId,
          description: `Early settlement ${plan.documentNumber}`,
          createdById,
        });
        const allPayments = readTable<any>('installmentPayments');
        allPayments.push({
          id: genId(),
          documentNumber: nextDocNumber('installmentPayments', 'INSTLP'),
          installmentPlanId: plan.id,
          scheduleItemId: null,
          paymentType: 'EARLY_SETTLEMENT',
          amount: finalAmount,
          principalAllocated: remainingPrincipal,
          interestAllocated: round4(remainingInterest - discount),
          paymentDate: body.settlementDate,
          method: body.method,
          cashMovementId: movement.id,
          companyId,
          createdById,
        });
        writeTable('installmentPayments', allPayments);
      }

      plan.status = 'SETTLED_EARLY';
      plan.settledAt = new Date().toISOString();
      plan.settlementDiscountAmount = discount;
      plan.settlementNotes = body.notes ?? null;
      writeTable('installmentPlans', plans);
      return plan;
    }

    if (seg1 && !seg2 && method === 'delete') {
      const plans = readTable<any>('installmentPlans');
      const plan = plans.find((p) => p.id === seg1 && p.companyId === companyId);
      if (!plan) throw new OfflineApiError('Installment plan not found');
      const payments = readTable<any>('installmentPayments').filter((p) => p.installmentPlanId === seg1);
      if (payments.some((p) => p.paymentType !== 'DOWN_PAYMENT')) {
        throw new OfflineApiError('لا يمكن إلغاء عقد تم تحصيل أقساط عليه بالفعل');
      }

      const lines = readTable<any>('installmentPlanLines').filter((l) => l.installmentPlanId === seg1);
      for (const line of lines) {
        receiveStock(
          line.productId,
          plan.warehouseId,
          Number(line.quantity),
          Number(line.unitCost),
          'INSTALLMENT_PLAN_CANCEL',
          plan.documentNumber,
          'SALES_RETURN',
        );
      }

      const cashMovements = readTable<any>('cashMovements').filter(
        (m) => !(m.sourceType === 'INSTALLMENT_PAYMENT' && m.sourceId === seg1),
      );
      writeTable('cashMovements', cashMovements);
      writeTable('installmentPayments', readTable<any>('installmentPayments').filter((p) => p.installmentPlanId !== seg1));
      writeTable(
        'installmentScheduleItems',
        readTable<any>('installmentScheduleItems').filter((i) => i.installmentPlanId !== seg1),
      );
      writeTable('installmentPlanLines', readTable<any>('installmentPlanLines').filter((l) => l.installmentPlanId !== seg1));
      writeTable('installmentPlans', plans.filter((p) => p.id !== seg1));
      return { success: true };
    }
  }

  // --- WhatsApp outbox (placeholder — see whatsappOutboxMessages) ------------
  if (seg0 === 'whatsapp' && seg1 === 'outbox' && method === 'get') {
    const companyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    return readTable<any>('whatsappOutboxMessages')
      .filter((m) => m.companyId === companyId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 20);
  }

  // --- Suppliers -------------------------------------------------------------
  if (seg0 === 'suppliers') {
    const suppliersCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg1 && method === 'get') {
      const currencies = readTable<any>('currencies');
      return genericList('suppliers')
        .filter((s: any) => s.companyId === suppliersCompanyId)
        .map((s: any) => ({
          ...s,
          currency: s.currencyId ? currencies.find((c) => c.id === s.currencyId) ?? null : null,
        }));
    }
    if (!seg1 && method === 'post') {
      const code = body.code || tryGetNextNumber('SUPPLIER') || `SUPP-${Date.now()}`;
      return genericCreate('suppliers', body, {
        companyId: suppliersCompanyId,
        code,
        openingBalance: body.openingBalance ?? 0,
      });
    }
    if (seg1 && !seg2 && method === 'patch') {
      const rows = readTable<any>('suppliers');
      const row = rows.find((r) => r.id === seg1 && r.companyId === suppliersCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      Object.assign(row, body, { companyId: suppliersCompanyId });
      writeTable('suppliers', rows);
      const currencies = readTable<any>('currencies');
      return { ...row, currency: row.currencyId ? currencies.find((c) => c.id === row.currencyId) ?? null : null };
    }
    if (seg1 && !seg2 && method === 'delete') return genericDelete('suppliers', seg1);
  }

  // --- Imports: cargo items + shipments (the "الاستيراد" section's other two tabs) --------
  if (seg0 === 'imports' && seg1 === 'cargo-items') {
    const cargoCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      const products = readTable<any>('products');
      const suppliers = readTable<any>('suppliers');
      const shipments = readTable<any>('shipments');
      const currencies = readTable<any>('currencies');
      return genericList('importCargoItems')
        .filter((c: any) => c.companyId === cargoCompanyId)
        .map((c: any) => ({
          ...c,
          product: products.find((p) => p.id === c.productId) ?? null,
          supplier: suppliers.find((s) => s.id === c.supplierId) ?? null,
          shipment: shipments.find((sh) => sh.id === c.shipmentId) ?? null,
          currency: c.currencyId ? currencies.find((cur) => cur.id === c.currencyId) ?? null : null,
          localCurrency: c.localCurrencyId ? currencies.find((cur) => cur.id === c.localCurrencyId) ?? null : null,
        }))
        .sort((a: any, b: any) =>
          a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : a.createdAt < b.createdAt ? 1 : -1,
        );
    }
    if (!seg2 && method === 'post') {
      // The supplier's own currency is the source of truth — never trusted from the client, so a
      // cargo line's currency can never drift from whatever the supplier's card actually says.
      // companyId is likewise always derived from the session, never the request body, matching
      // the real backend's @CurrentUser()-driven ImportCargoItemsController.create().
      const supplier = readTable<any>('suppliers').find((s) => s.id === body.supplierId && s.companyId === cargoCompanyId);
      if (!supplier) throw new OfflineApiError('Supplier not found');
      // orderDate/status/notes are no longer collected from the add form — defaulted here instead.
      return genericCreate('importCargoItems', body, {
        companyId: cargoCompanyId,
        orderDate: body.orderDate ?? new Date().toISOString().slice(0, 10),
        status: body.status ?? 'ORDERED',
        notes: body.notes ?? null,
        currencyId: supplier.currencyId ?? null,
        conversionRate: body.conversionRate ?? 1,
        localCurrencyId: body.localCurrencyId ?? null,
        createdAt: new Date().toISOString(),
      });
    }
    if (seg2 && method === 'patch') {
      const rows = readTable<any>('importCargoItems');
      const row = rows.find((r) => r.id === seg2 && r.companyId === cargoCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      const supplier = readTable<any>('suppliers').find((s) => s.id === body.supplierId && s.companyId === cargoCompanyId);
      if (!supplier) throw new OfflineApiError('Supplier not found');
      Object.assign(row, body, {
        companyId: cargoCompanyId,
        currencyId: supplier.currencyId ?? null,
        conversionRate: body.conversionRate ?? 1,
        localCurrencyId: body.localCurrencyId ?? null,
      });
      writeTable('importCargoItems', rows);
      return row;
    }
    if (seg2 && method === 'delete') {
      const row = readTable<any>('importCargoItems').find((r) => r.id === seg2 && r.companyId === cargoCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      return genericDelete('importCargoItems', seg2);
    }
  }
  // A shipment's total cost is never a separately-entered figure — it's always the live sum of
  // its expense lines, mirroring the backend's ShipmentsService, so it can never drift out of sync.
  if (seg0 === 'imports' && seg1 === 'shipments') {
    const shipmentsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      const allExpenses = readTable<any>('shipmentExpenses');
      return genericList('shipments')
        .filter((s: any) => s.companyId === shipmentsCompanyId)
        .map((s: any) => ({
          ...s,
          totalCost: allExpenses
            .filter((e) => e.shipmentId === s.id)
            .reduce((sum, e) => sum + Number(e.amount ?? 0), 0),
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (!seg2 && method === 'post') {
      return genericCreate('shipments', body, { companyId: shipmentsCompanyId });
    }
    if (seg2 && !seg3 && method === 'get') {
      const shipments = readTable<any>('shipments');
      const shipment = shipments.find((s) => s.id === seg2 && s.companyId === shipmentsCompanyId);
      if (!shipment) throw new OfflineApiError('Not found');
      const expenseTypes = readTable<any>('shippingExpenseTypes');
      const expenses = readTable<any>('shipmentExpenses')
        .filter((e) => e.shipmentId === seg2)
        .map((e) => ({
          ...e,
          shippingExpenseType: expenseTypes.find((et) => et.id === e.shippingExpenseTypeId) ?? null,
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
      const totalCost = expenses.reduce((sum, e) => sum + Number(e.amount ?? 0), 0);
      return { ...shipment, expenses, totalCost };
    }
    if (seg2 && !seg3 && method === 'patch') {
      const rows = readTable<any>('shipments');
      const row = rows.find((r) => r.id === seg2 && r.companyId === shipmentsCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      Object.assign(row, body, { companyId: shipmentsCompanyId });
      writeTable('shipments', rows);
      return row;
    }
    if (seg2 && !seg3 && method === 'delete') {
      const shipments = readTable<any>('shipments');
      const shipment = shipments.find((s) => s.id === seg2 && s.companyId === shipmentsCompanyId);
      if (!shipment) throw new OfflineApiError('Not found');
      // Cascades to this shipment's expense lines too — mirrors the backend's onDelete: CASCADE.
      const expenses = readTable<any>('shipmentExpenses');
      writeTable(
        'shipmentExpenses',
        expenses.filter((e) => e.shipmentId !== seg2),
      );
      return genericDelete('shipments', seg2);
    }
    if (seg2 && seg3 === 'expenses' && !seg4 && method === 'post') {
      const shipment = readTable<any>('shipments').find((s) => s.id === seg2 && s.companyId === shipmentsCompanyId);
      if (!shipment) throw new OfflineApiError('Not found');
      const expenseTypes = readTable<any>('shippingExpenseTypes');
      const row = genericCreate('shipmentExpenses', body, { shipmentId: seg2 });
      return { ...row, shippingExpenseType: expenseTypes.find((et) => et.id === row.shippingExpenseTypeId) ?? null };
    }
    if (seg2 && seg3 === 'expenses' && seg4 && method === 'patch') {
      const shipment = readTable<any>('shipments').find((s) => s.id === seg2 && s.companyId === shipmentsCompanyId);
      if (!shipment) throw new OfflineApiError('Not found');
      const rows = readTable<any>('shipmentExpenses');
      const row = rows.find((r) => r.id === seg4 && r.shipmentId === seg2);
      if (!row) throw new OfflineApiError('Not found');
      Object.assign(row, body);
      writeTable('shipmentExpenses', rows);
      const expenseTypes = readTable<any>('shippingExpenseTypes');
      return { ...row, shippingExpenseType: expenseTypes.find((et) => et.id === row.shippingExpenseTypeId) ?? null };
    }
    if (seg2 && seg3 === 'expenses' && seg4 && method === 'delete') {
      const shipment = readTable<any>('shipments').find((s) => s.id === seg2 && s.companyId === shipmentsCompanyId);
      if (!shipment) throw new OfflineApiError('Not found');
      const rows = readTable<any>('shipmentExpenses');
      const next = rows.filter((r) => !(r.id === seg4 && r.shipmentId === seg2));
      if (next.length === rows.length) throw new OfflineApiError('Not found');
      writeTable('shipmentExpenses', next);
      return { deleted: true };
    }
  }
  // A payment against a shipment's cost — always mirrored by a cash movement (mirrors
  // ShipmentPaymentsService), so the treasury balance and this history never disagree.
  if (seg0 === 'imports' && seg1 === 'shipment-payments') {
    const shipmentPaymentsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      const shipments = readTable<any>('shipments');
      return genericList('shipmentPayments')
        .filter((p: any) => p.companyId === shipmentPaymentsCompanyId)
        .map((p: any) => ({
          ...p,
          shipment: shipments.find((s) => s.id === p.shipmentId) ?? null,
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (!seg2 && method === 'post') {
      const shipment = readTable<any>('shipments').find(
        (s) => s.id === body.shipmentId && s.companyId === shipmentPaymentsCompanyId,
      );
      if (!shipment) throw new OfflineApiError('Shipment not found');

      const amount = Number(body.amount);
      // SHIPPING_COST is a memo-only record of freight spend, never a real payment — it must
      // never touch the treasury balance (no balance check, no cash movement), unlike every
      // other payment type here which actually moves money out of CASH/BANK.
      const isMemoOnly = body.paymentType === 'SHIPPING_COST';

      // Checked before any row is written — a rejected payment (Printing Press only) must abort
      // here, before the payment record or its cash movement exist at all.
      if (!isMemoOnly) {
        assertSufficientBalance(shipmentPaymentsCompanyId, body.account, amount);
      }

      const documentNumber = tryGetNextNumber('SHIPMENT_PAYMENT') ?? `SHPMT-${Date.now()}`;
      const savedPayment = genericCreate(
        'shipmentPayments',
        {
          paymentDate: body.paymentDate,
          shipmentId: body.shipmentId,
          paymentType: body.paymentType,
          amount,
          account: body.account,
          notes: body.notes ?? null,
        },
        { companyId: shipmentPaymentsCompanyId, documentNumber },
      );

      if (!isMemoOnly) {
        recordCashMovement({
          companyId: shipmentPaymentsCompanyId,
          movementDate: body.paymentDate,
          type: 'EXPENSE',
          account: body.account,
          amount,
          sourceType: 'SHIPMENT_PAYMENT',
          sourceId: savedPayment.id,
          description: `Shipment payment ${documentNumber}`,
        });
      }

      return savedPayment;
    }
    if (seg2 && (method === 'patch' || method === 'delete')) {
      const payments = readTable<any>('shipmentPayments');
      const existing = payments.find((p: any) => p.id === seg2 && p.companyId === shipmentPaymentsCompanyId);
      if (!existing) throw new OfflineApiError('Shipment payment not found');

      // The old movement is still present at this point (not yet removed) — add its amount back
      // via excludeAmount instead of physically deleting it first, so a failed balance check
      // leaves the old movement completely untouched (this mock has no transaction/rollback).
      const oldMovementAmount = readTable<any>('cashMovements')
        .filter(
          (m: any) => m.companyId === shipmentPaymentsCompanyId && m.sourceType === 'SHIPMENT_PAYMENT' && m.sourceId === seg2,
        )
        .reduce((sum: number, m: any) => sum + Number(m.amount), 0);

      // SHIPPING_COST is a memo-only record — never checked against the balance, and no movement
      // is re-recorded below. Switching a payment's type to/from SHIPPING_COST on edit is exactly
      // how this correctly starts/stops affecting the treasury.
      const isMemoOnly = method === 'patch' && body.paymentType === 'SHIPPING_COST';

      if (method === 'patch') {
        const shipment = readTable<any>('shipments').find(
          (s) => s.id === body.shipmentId && s.companyId === shipmentPaymentsCompanyId,
        );
        if (!shipment) throw new OfflineApiError('Shipment not found');
        if (!isMemoOnly) {
          assertSufficientBalance(shipmentPaymentsCompanyId, body.account, Number(body.amount), undefined, oldMovementAmount);
        }
      }

      // Balance already asserted sufficient above — safe to remove the old movement now.
      const movements = readTable<any>('cashMovements').filter(
        (m: any) => !(m.companyId === shipmentPaymentsCompanyId && m.sourceType === 'SHIPMENT_PAYMENT' && m.sourceId === seg2),
      );
      writeTable('cashMovements', movements);

      if (method === 'delete') {
        writeTable(
          'shipmentPayments',
          payments.filter((p: any) => p.id !== seg2),
        );
        return { id: seg2 };
      }

      const amount = Number(body.amount);
      Object.assign(existing, {
        paymentDate: body.paymentDate,
        shipmentId: body.shipmentId,
        paymentType: body.paymentType,
        amount,
        account: body.account,
        notes: body.notes ?? null,
      });
      writeTable('shipmentPayments', payments);

      if (!isMemoOnly) {
        recordCashMovement({
          companyId: shipmentPaymentsCompanyId,
          movementDate: body.paymentDate,
          type: 'EXPENSE',
          account: body.account,
          amount,
          sourceType: 'SHIPMENT_PAYMENT',
          sourceId: seg2,
          description: `Shipment payment ${existing.documentNumber}`,
        });
      }

      return existing;
    }
  }
  if (seg0 === 'imports' && seg1 === 'shipping-expense-types') {
    const expenseTypesCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      return genericList('shippingExpenseTypes').filter((r: any) => r.companyId === expenseTypesCompanyId);
    }
    if (!seg2 && method === 'post') return genericCreate('shippingExpenseTypes', body, { companyId: expenseTypesCompanyId });
    if (seg2 && method === 'patch') {
      const rows = readTable<any>('shippingExpenseTypes');
      const row = rows.find((r) => r.id === seg2 && r.companyId === expenseTypesCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      Object.assign(row, body, { companyId: expenseTypesCompanyId });
      writeTable('shippingExpenseTypes', rows);
      return row;
    }
    if (seg2 && method === 'delete') {
      const row = readTable<any>('shippingExpenseTypes').find((r) => r.id === seg2 && r.companyId === expenseTypesCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      return genericDelete('shippingExpenseTypes', seg2);
    }
  }

  // --- Sales representatives --------------------------------------------------
  if (seg0 === 'sales-representatives') {
    const repsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg1 === 'reports' && seg2 === 'summary' && method === 'get') {
      return buildSalesRepresentativesReport(repsCompanyId, params?.dateFrom, params?.dateTo, params?.representativeId);
    }
    if (seg1 === 'reports' && seg2 === 'quarterly-trend' && method === 'get') {
      return buildSalesRepresentativesQuarterlyTrend(
        repsCompanyId,
        Number(params?.year),
        Number(params?.quarter),
        params?.representativeId,
      );
    }
    if (seg1 === 'reports' && seg2 === 'profitability' && method === 'get') {
      return buildManagersProfitability(repsCompanyId, params?.dateFrom, params?.dateTo);
    }
    if (seg1 === 'reports' && seg2 === 'branch-commissions' && method === 'get') {
      return buildBranchManagersCommission(repsCompanyId, params?.dateFrom, params?.dateTo);
    }
    if (seg1 === 'reports' && seg2 === 'invoices' && method === 'get') {
      return buildSalesRepresentativesInvoices(repsCompanyId, params?.dateFrom, params?.dateTo, params?.representativeId);
    }
    if (seg1 === 'reports' && seg2 === 'receipts' && method === 'get') {
      return buildSalesRepresentativesReceipts(repsCompanyId, params?.dateFrom, params?.dateTo, params?.representativeId);
    }
    if (!seg1 && method === 'get') {
      const branches = readTable<any>('branches');
      return genericList('salesRepresentatives')
        .filter((r: any) => r.companyId === repsCompanyId)
        .map((r: any) => ({ ...r, branch: branches.find((b) => b.id === r.branchId) ?? null }));
    }
    if (!seg1 && method === 'post') {
      assertBranchRequiredForPress(repsCompanyId, body.branchId);
      const code = body.code || tryGetNextNumber('SALES_REPRESENTATIVE') || `REP-${Date.now()}`;
      return genericCreate('salesRepresentatives', body, { companyId: repsCompanyId, code });
    }
    // Self-service "لوحة المدير" dashboard — must be checked before the generic seg1-only
    // patch/delete branches below (those match any truthy seg1), same ordering rule as the
    // commission-exceptions branch right after it, so 'me' is never treated as a rep id.
    if (seg1 === 'me' && seg2 === 'dashboard' && method === 'get') {
      return buildManagerDashboard(repsCompanyId, params?.dateFrom, params?.dateTo);
    }
    // Admin drill-down — same ordering rule as 'me/dashboard' above (must come before the generic
    // seg1-only branches so seg1 here, a real rep id, is never treated as a plain :id GET/PATCH).
    if (seg1 && seg2 === 'dashboard' && !seg3 && method === 'get') {
      return buildManagerDashboardByRepId(repsCompanyId, seg1, params?.dateFrom, params?.dateTo);
    }
    // Must be checked before the generic seg1-only patch/delete branches below, since those match
    // any truthy seg1 regardless of seg2/seg3 — a DELETE here would otherwise delete the rep itself.
    if (seg1 && seg2 === 'commission-exceptions' && !seg3 && method === 'get') {
      const products = readTable<any>('products');
      const categories = readTable<any>('productCategories');
      return readTable<any>('commissionExceptions')
        .filter((e) => e.companyId === repsCompanyId && e.salesRepresentativeId === seg1)
        .map((e) => ({
          ...e,
          product: e.productId ? products.find((p) => p.id === e.productId) ?? null : null,
          category: e.categoryId ? categories.find((c) => c.id === e.categoryId) ?? null : null,
        }));
    }
    if (seg1 && seg2 === 'commission-exceptions' && !seg3 && method === 'post') {
      if (!!body.productId === !!body.categoryId) {
        throw new OfflineApiError('يجب تحديد منتج واحد أو فئة واحدة، وليس كلاهما أو لا شيء');
      }
      return genericCreate('commissionExceptions', body, {
        companyId: repsCompanyId,
        salesRepresentativeId: seg1,
        productId: body.productId ?? null,
        categoryId: body.categoryId ?? null,
      });
    }
    if (seg1 && seg2 === 'commission-exceptions' && seg3 && method === 'delete') {
      return genericDelete('commissionExceptions', seg3);
    }
    if (seg1 && method === 'patch') {
      const rows = readTable<any>('salesRepresentatives');
      const row = rows.find((r) => r.id === seg1 && r.companyId === repsCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      const branchId = body.branchId !== undefined ? body.branchId : row.branchId;
      assertBranchRequiredForPress(repsCompanyId, branchId);
      Object.assign(row, body, { companyId: repsCompanyId });
      writeTable('salesRepresentatives', rows);
      return row;
    }
    if (seg1 && method === 'delete') return genericDelete('salesRepresentatives', seg1);
  }

  // --- Numbering series (create sets nextNumber = startNumber, like the real backend) --------
  if (seg0 === 'settings' && seg1 === 'numbering-series' && !seg2 && method === 'post') {
    const startNumber = Number(body.startNumber ?? 1);
    const companyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    return genericCreate('numberingSeries', body, { companyId, startNumber, nextNumber: startNumber });
  }

  // --- Settings: partners (custom — combined share can never exceed 100% within its own cap-table
  // scope: company-wide for every company, or per-branch for Printing Press's branchId column) ----
  if (seg0 === 'settings' && seg1 === 'partners') {
    const companyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      const rows = genericList('partners').filter((r: any) => r.companyId === companyId);
      return params?.branchId ? rows.filter((r: any) => r.branchId === params.branchId) : rows;
    }
    if (!seg2 && method === 'post') {
      const branchId = body.branchId ?? null;
      assertPartnerShareWithinLimit(companyId, Number(body.sharePercentage), branchId);
      return genericCreate('partners', { ...body, branchId }, { companyId, isActive: true });
    }
    if (seg2 && method === 'patch') {
      const rows = readTable<any>('partners');
      const row = rows.find((r) => r.id === seg2 && r.companyId === companyId);
      if (!row) throw new OfflineApiError('Not found');
      if (body.sharePercentage != null) {
        const branchId = body.branchId !== undefined ? body.branchId ?? null : row.branchId ?? null;
        assertPartnerShareWithinLimit(companyId, Number(body.sharePercentage), branchId, seg2);
      }
      Object.assign(row, body, { companyId, branchId: body.branchId !== undefined ? body.branchId ?? null : row.branchId });
      writeTable('partners', rows);
      return row;
    }
    if (seg2 && method === 'delete') return genericDelete('partners', seg2);
  }

  // --- Settings: currency exchange rates (nested under /settings/currencies) -----------------
  if (seg0 === 'settings' && seg1 === 'currencies' && seg2 === 'exchange-rates') {
    if (method === 'get') {
      const currencies = readTable<any>('currencies');
      const companyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
      return readTable<any>('exchangeRates')
        .filter((r: any) => r.companyId === companyId)
        .map((r: any) => ({ ...r, currency: currencies.find((c) => c.id === r.currencyId) ?? null }))
        .sort((a: any, b: any) => (a.effectiveDate < b.effectiveDate ? 1 : -1));
    }
    if (method === 'post') {
      const companyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
      return genericCreate('exchangeRates', body, { companyId });
    }
  }

  // Cross-company branch lookup for the Users & Roles "add user" form's conditional branch picker
  // (a role restricted to one specific company — see Role.restrictedCompanyId — may not match
  // whichever company the admin currently has active) — mirrors BranchesController.findAll()'s
  // companyId query-param override on the real backend: only ever honored for a company the caller
  // can actually reach, never a blind cross-tenant lookup.
  if (seg0 === 'settings' && seg1 === 'branches' && !seg2 && method === 'get' && params?.companyId) {
    const sessionUser = getOfflineSessionUser();
    const requested = String(params.companyId);
    const allowed = sessionUser?.allCompanies || sessionUser?.companyIds?.includes(requested);
    const companyId = allowed ? requested : (sessionUser?.companyId ?? OFFLINE_COMPANY_ID);
    return genericList('branches').filter((r: any) => r.companyId === companyId);
  }

  // --- Settings master data — every table here is scoped to the caller's active company except
  // 'companies' itself (the tenant boundary — an Administrator managing Settings > Companies
  // needs to see and edit every company, not just their currently-active one). ------------------
  const settingsTableMap: Record<string, string> = {
    branches: 'branches',
    warehouses: 'warehouses',
    currencies: 'currencies',
    taxes: 'taxes',
    units: 'units',
    'product-categories': 'productCategories',
    brands: 'brands',
    'numbering-series': 'numberingSeries',
    companies: 'companies',
    'package-types': 'packageTypes',
    'expense-categories': 'expenseCategories',
  };
  if (seg0 === 'settings' && settingsTableMap[seg1]) {
    const table = settingsTableMap[seg1];
    const companyScoped = seg1 !== 'companies';
    const companyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      let rows = genericList(table);
      if (companyScoped) rows = rows.filter((r: any) => r.companyId === companyId);
      if (seg1 === 'warehouses' && params?.search) {
        const q = String(params.search).toLowerCase();
        rows = rows.filter((w: any) => [w.code, w.nameEn, w.nameAr].some((v) => (v ?? '').toLowerCase().includes(q)));
      }
      return rows;
    }
    if (!seg2 && method === 'post') {
      return genericCreate(table, body, companyScoped ? { companyId } : {});
    }
    if (seg2 && method === 'patch') {
      const rows = readTable<any>(table);
      const row = rows.find((r) => r.id === seg2 && (!companyScoped || r.companyId === companyId));
      if (!row) throw new OfflineApiError('Not found');
      Object.assign(row, body, companyScoped ? { companyId } : {});
      writeTable(table, rows);
      return row;
    }
    if (seg2 && method === 'delete') return genericDelete(table, seg2);
  }

  // --- Inventory: products -----------------------------------------------------
  if (seg0 === 'inventory' && seg1 === 'products') {
    const productsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    // A row with no productType at all predates this field — treat it the same as RAW_MATERIAL
    // rather than requiring a one-time data migration for existing offline demo data.
    const isRawMaterial = (p: any) => (p.productType ?? 'RAW_MATERIAL') === 'RAW_MATERIAL';
    const isCatalogItem = (p: any) => p.productType === 'CATALOG_ITEM';

    // Printing Press "المنتجات" catalog — declared before the generic ':id' branches below so
    // 'catalog' is never treated as a product id. Mirrors ProductsService's find-or-create
    // defaults: a catalog item has no real category/unit/packaging, so one hidden placeholder row
    // per company silently satisfies those otherwise-mandatory columns.
    if (seg2 === 'catalog' && !seg3 && method === 'get') {
      return genericList('products').filter((p: any) => p.companyId === productsCompanyId && isCatalogItem(p));
    }
    if (seg2 === 'catalog' && !seg3 && method === 'post') {
      function findOrCreate(table: string, code: string, nameEn: string, nameAr: string, extra: Record<string, unknown> = {}) {
        const rows = readTable<any>(table);
        const existing = rows.find((r) => r.companyId === productsCompanyId && r.code === code);
        if (existing) return existing;
        return genericCreate(table, { code, nameEn, nameAr, ...extra }, { companyId: productsCompanyId });
      }
      const category = findOrCreate('productCategories', 'CATALOG', 'Printing Products', 'منتجات المطبعة');
      // Units/package types now require a categoryId (dependent-dropdown filtering) — the
      // auto-provisioned ones for this internal placeholder link back to the placeholder category.
      const unit = findOrCreate('units', 'PCS', 'Piece', 'قطعة', { categoryId: category.id });
      const packageType = findOrCreate('packageTypes', 'ITEM', 'Item', 'صنف', { categoryId: category.id });
      return genericCreate(
        'products',
        {},
        {
          companyId: productsCompanyId,
          nameEn: body.nameEn,
          nameAr: body.nameEn,
          size: body.size ?? null,
          notes: body.notes ?? null,
          sellingPrice: body.sellingPrice ?? null,
          categoryId: category.id,
          unitId: unit.id,
          packageTypeId: packageType.id,
          unitsPerPackage: 1,
          productType: 'CATALOG_ITEM',
          averageCost: 0,
          purchasePrice: 0,
          packagePurchasePrice: null,
          packageSellingPrice: null,
        },
      );
    }
    if (seg2 === 'catalog' && seg3 && method === 'patch') {
      const products = readTable<any>('products');
      const product = products.find((p) => p.id === seg3 && p.companyId === productsCompanyId && isCatalogItem(p));
      if (!product) throw new OfflineApiError('Not found');
      if (body.nameEn !== undefined) {
        product.nameEn = body.nameEn;
        product.nameAr = body.nameEn;
      }
      if (body.size !== undefined) product.size = body.size;
      if (body.notes !== undefined) product.notes = body.notes;
      if (body.sellingPrice !== undefined) product.sellingPrice = body.sellingPrice;
      writeTable('products', products);
      return product;
    }

    // Raw materials flagged "قابلة للبيع المباشر" — merged into the Printing Press sales
    // invoice/quotation item picker alongside catalog items (see SalesLineEditor). Declared
    // before the generic ':id' branches for the same reason as 'catalog' above.
    if (seg2 === 'sellable-raw-materials' && !seg3 && method === 'get') {
      return genericList('products').filter(
        (p: any) => p.companyId === productsCompanyId && isRawMaterial(p) && p.isSellable === true,
      );
    }

    if (!seg2 && method === 'get') {
      const products = genericList('products').filter(
        (p: any) => p.companyId === productsCompanyId && isRawMaterial(p),
      );
      const search = params?.search?.trim();
      if (!search) return products;
      const q = search.toLowerCase();
      const brands = readTable<any>('brands');
      const categories = readTable<any>('productCategories');
      return products.filter((p: any) => {
        const brandName = p.brandId ? brands.find((b) => b.id === p.brandId)?.nameEn ?? '' : '';
        const categoryName = p.categoryId ? categories.find((c) => c.id === p.categoryId)?.nameEn ?? '' : '';
        return [p.sku, p.barcode, p.nameEn, brandName, categoryName].some((v) =>
          (v ?? '').toLowerCase().includes(q),
        );
      });
    }
    if (!seg2 && method === 'post') {
      // Stage 1 (this form) defines identity + packaging only — purchase cost/averageCost stay
      // null/0 until the product's first Purchase Receipt (Stage 2) sets them. sellingPrice is the
      // one exception (Printing Press "سعر البيع المقترح" for sellable raw materials), honored from
      // the body here exactly like update() already does, instead of being forced null.
      const unitsPerPackage = Number(body.unitsPerPackage);
      return genericCreate('products', body, {
        companyId: productsCompanyId,
        averageCost: 0,
        purchasePrice: 0,
        sellingPrice: body.sellingPrice ?? null,
        reorderLevel: Number(body.reorderLevel ?? 0),
        unitsPerPackage,
        packagePurchasePrice: null,
        packageSellingPrice: null,
        productType: 'RAW_MATERIAL',
      });
    }
    if (seg2 && method === 'patch') {
      const products = readTable<any>('products');
      const product = products.find((p) => p.id === seg2 && p.companyId === productsCompanyId);
      if (!product) throw new OfflineApiError('Not found');
      Object.assign(product, body, { companyId: productsCompanyId });
      if (body.unitsPerPackage != null) product.unitsPerPackage = Number(body.unitsPerPackage);
      if (body.reorderLevel != null) product.reorderLevel = Number(body.reorderLevel);
      writeTable('products', products);
      return product;
    }
    if (seg2 && method === 'delete') return genericDelete('products', seg2);
  }

  // --- Inventory: purchase receipts (Stage 2) ---------------------------------
  if (seg0 === 'inventory' && seg1 === 'purchase-receipts') {
    const purchaseReceiptsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      const products = readTable<any>('products');
      const warehouses = readTable<any>('warehouses');
      const suppliers = readTable<any>('suppliers');
      let rows = genericList('purchaseReceipts').filter((r: any) => r.companyId === purchaseReceiptsCompanyId);
      if (params?.productId) rows = rows.filter((r: any) => r.productId === params.productId);
      if (params?.warehouseId) rows = rows.filter((r: any) => r.warehouseId === params.warehouseId);
      return rows
        .map((r: any) => ({
          ...r,
          product: products.find((p: any) => p.id === r.productId) ?? { nameEn: 'Unknown' },
          warehouse: warehouses.find((w: any) => w.id === r.warehouseId) ?? { nameEn: 'Unknown' },
          supplier: suppliers.find((s: any) => s.id === r.supplierId) ?? null,
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (!seg2 && method === 'post') {
      const products = readTable<any>('products');
      const product = products.find((p: any) => p.id === body.productId);
      if (!product) throw new OfflineApiError('Product not found');

      const unitsPerPackage = Number(product.unitsPerPackage);
      if (!unitsPerPackage || unitsPerPackage <= 0) {
        throw new OfflineApiError('This product has no valid units-per-package set');
      }
      const totalUnits = Number(body.quantityPackages) * unitsPerPackage;
      const packagePurchasePrice = Number(body.packagePurchasePrice);
      const unitCost = Math.round((packagePurchasePrice / unitsPerPackage) * 10000) / 10000;
      const totalAmount = Number(body.quantityPackages) * packagePurchasePrice;
      const paidAmount = body.paidAmount != null ? Number(body.paidAmount) : 0;
      if (paidAmount > totalAmount) {
        throw new OfflineApiError('Paid amount cannot exceed the receipt total');
      }
      if (paidAmount > 0 && !body.paymentAccount) {
        throw new OfflineApiError('paymentAccount is required when paidAmount is greater than 0');
      }

      // Checked before any stock/receipt mutation runs — this mock has no transaction/rollback, so
      // a rejected payment must abort here, before a single unit is added to the warehouse.
      if (paidAmount > 0) {
        assertSufficientBalance(purchaseReceiptsCompanyId, body.paymentAccount, paidAmount, body.branchId ?? undefined);
      }

      const documentNumber = tryGetNextNumber('PURCHASE_RECEIPT') ?? `REC-${Date.now()}`;

      // Explicit movementType — omitting it falls back to OPENING_STOCK (receiveStock()'s default
      // for a non-adjustment referenceType), mislabeling every purchase's own movement-report row.
      receiveStock(body.productId, body.warehouseId, totalUnits, unitCost, 'PURCHASE_RECEIPT', documentNumber, 'PURCHASE_RECEIPT');

      // receiveStock() already wrote its own updated copy of the products table (to refresh
      // averageCost) — re-read here so this second write layers pricing on top instead of
      // clobbering that update with the stale array captured above.
      const productsAfterStock = readTable<any>('products');
      const productAfterStock = productsAfterStock.find((p: any) => p.id === body.productId);
      const packageSellingPrice = body.packageSellingPrice != null ? Number(body.packageSellingPrice) : null;
      const unitSellingPrice = body.unitSellingPrice != null ? Number(body.unitSellingPrice) : null;
      Object.assign(productAfterStock, {
        packagePurchasePrice,
        purchasePrice: unitCost,
        ...(packageSellingPrice != null ? { packageSellingPrice } : {}),
        ...(unitSellingPrice != null ? { sellingPrice: unitSellingPrice } : {}),
      });
      writeTable('products', productsAfterStock);

      const savedReceipt = genericCreate('purchaseReceipts', {
        documentNumber,
        receiptDate: body.receiptDate,
        productId: body.productId,
        warehouseId: body.warehouseId,
        supplierId: body.supplierId,
        branchId: body.branchId ?? null,
        quantityPackages: Number(body.quantityPackages),
        unitsPerPackage,
        totalUnits,
        packagePurchasePrice,
        unitCost,
        totalAmount,
        paidAmount,
        packageSellingPrice,
        unitSellingPrice,
      }, { companyId: purchaseReceiptsCompanyId, createdAt: new Date().toISOString() });

      // Only the amount actually paid up front (cash/transfer) leaves the treasury — the rest is
      // owed to the supplier and settled later via a separate supplier payment. A fully-credit
      // (آجل) receipt with paidAmount 0 correctly debits nothing here — mirrors
      // PurchaseReceiptsService.create() on the real backend. Balance was already asserted
      // sufficient above, before the stock receive — this just posts the movement.
      if (paidAmount > 0) {
        recordCashMovement({
          companyId: purchaseReceiptsCompanyId,
          branchId: body.branchId ?? null,
          movementDate: body.receiptDate,
          type: 'EXPENSE',
          account: body.paymentAccount,
          amount: paidAmount,
          sourceType: 'PURCHASE_RECEIPT',
          sourceId: savedReceipt.id,
          partySupplierId: body.supplierId,
          description: `Purchase receipt ${documentNumber}`,
        });
      }

      return savedReceipt;
    }
    if (seg2 && (method === 'patch' || method === 'delete')) {
      const receipts = readTable<any>('purchaseReceipts');
      const existing = receipts.find((r: any) => r.id === seg2 && r.companyId === purchaseReceiptsCompanyId);
      if (!existing) throw new OfflineApiError('Purchase receipt not found');

      // method === 'patch': validate the edited figures — including the balance check — BEFORE
      // any stock or cash-movement mutation runs. This mock has no transaction/rollback, so every
      // check that can reject the request must run first; nothing below this point may throw.
      let totalUnits = 0;
      let unitCost = 0;
      let unitsPerPackage = 0;
      let packagePurchasePrice = 0;
      let totalAmount = 0;
      let paidAmount = 0;
      let packageSellingPrice: number | null = null;
      let unitSellingPrice: number | null = null;
      if (method === 'patch') {
        const products = readTable<any>('products');
        const product = products.find((p: any) => p.id === body.productId);
        if (!product) throw new OfflineApiError('Product not found');

        unitsPerPackage = Number(product.unitsPerPackage);
        if (!unitsPerPackage || unitsPerPackage <= 0) {
          throw new OfflineApiError('This product has no valid units-per-package set');
        }
        totalUnits = Number(body.quantityPackages) * unitsPerPackage;
        packagePurchasePrice = Number(body.packagePurchasePrice);
        unitCost = Math.round((packagePurchasePrice / unitsPerPackage) * 10000) / 10000;
        totalAmount = Number(body.quantityPackages) * packagePurchasePrice;
        paidAmount = body.paidAmount != null ? Number(body.paidAmount) : 0;
        packageSellingPrice = body.packageSellingPrice != null ? Number(body.packageSellingPrice) : null;
        unitSellingPrice = body.unitSellingPrice != null ? Number(body.unitSellingPrice) : null;
        if (paidAmount > totalAmount) {
          throw new OfflineApiError('Paid amount cannot exceed the receipt total');
        }
        if (paidAmount > 0 && !body.paymentAccount) {
          throw new OfflineApiError('paymentAccount is required when paidAmount is greater than 0');
        }
        if (paidAmount > 0) {
          // The old movement is still present in the table at this point (not yet removed) — add
          // its amount back via excludeAmount instead of physically deleting it first, so a failed
          // check leaves the old movement completely untouched.
          const oldMovementAmount = readTable<any>('cashMovements')
            .filter((m: any) => m.companyId === purchaseReceiptsCompanyId && m.sourceType === 'PURCHASE_RECEIPT' && m.sourceId === seg2)
            .reduce((sum: number, m: any) => sum + Number(m.amount), 0);
          assertSufficientBalance(purchaseReceiptsCompanyId, body.paymentAccount, paidAmount, body.branchId ?? undefined, oldMovementAmount);
        }
      }

      // Reverses the receipt's ORIGINAL stock effect (its own product/warehouse/quantity) before
      // anything else — mirrors PurchaseReceiptsService.update()/remove() on the real backend:
      // throws if the warehouse no longer holds enough of it (e.g. already sold/transferred
      // elsewhere), which correctly blocks an edit/delete that can't be honestly reconciled.
      const levels = readTable<any>('stockLevels');
      const level = levels.find(
        (l: any) => l.productId === existing.productId && l.warehouseId === existing.warehouseId,
      );
      const available = Number(level?.quantityOnHand ?? 0);
      if (available < Number(existing.totalUnits)) {
        throw new OfflineApiError(
          `Insufficient stock to reverse this receipt: available ${available}, need ${existing.totalUnits}`,
        );
      }
      issueStock(
        existing.productId,
        existing.warehouseId,
        Number(existing.totalUnits),
        'PURCHASE_RECEIPT_EDIT',
        existing.documentNumber,
        'PURCHASE_RETURN',
      );

      // Removes whatever cash movement this receipt originally created — either the whole story
      // for a delete, or the first half of "delete then recreate" for an edit (see below).
      const movements = readTable<any>('cashMovements').filter(
        (m: any) => !(m.companyId === purchaseReceiptsCompanyId && m.sourceType === 'PURCHASE_RECEIPT' && m.sourceId === seg2),
      );
      writeTable('cashMovements', movements);

      if (method === 'delete') {
        writeTable(
          'purchaseReceipts',
          receipts.filter((r: any) => r.id !== seg2),
        );
        return { id: seg2 };
      }

      // method === 'patch': reapply the edited figures in full (same reverse-then-reapply
      // reasoning as the real backend — handles a changed product/warehouse/quantity/price
      // uniformly instead of computing a delta). All validation already happened above.
      receiveStock(body.productId, body.warehouseId, totalUnits, unitCost, 'PURCHASE_RECEIPT_EDIT', existing.documentNumber, 'PURCHASE_RECEIPT');

      const productsAfterStock = readTable<any>('products');
      const productAfterStock = productsAfterStock.find((p: any) => p.id === body.productId);
      Object.assign(productAfterStock, {
        packagePurchasePrice,
        purchasePrice: unitCost,
        ...(packageSellingPrice != null ? { packageSellingPrice } : {}),
        ...(unitSellingPrice != null ? { sellingPrice: unitSellingPrice } : {}),
      });
      writeTable('products', productsAfterStock);

      const receiptsAfterStock = readTable<any>('purchaseReceipts');
      const receiptToUpdate = receiptsAfterStock.find((r: any) => r.id === seg2);
      Object.assign(receiptToUpdate, {
        receiptDate: body.receiptDate,
        productId: body.productId,
        warehouseId: body.warehouseId,
        supplierId: body.supplierId,
        branchId: body.branchId ?? null,
        quantityPackages: Number(body.quantityPackages),
        unitsPerPackage,
        totalUnits,
        packagePurchasePrice,
        unitCost,
        totalAmount,
        paidAmount,
        packageSellingPrice,
        unitSellingPrice,
      });
      writeTable('purchaseReceipts', receiptsAfterStock);

      // Balance was already asserted sufficient above, before any stock/cash mutation ran — this
      // just posts the new movement.
      if (paidAmount > 0) {
        recordCashMovement({
          companyId: purchaseReceiptsCompanyId,
          branchId: body.branchId ?? null,
          movementDate: body.receiptDate,
          type: 'EXPENSE',
          account: body.paymentAccount,
          amount: paidAmount,
          sourceType: 'PURCHASE_RECEIPT',
          sourceId: seg2,
          partySupplierId: body.supplierId,
          description: `Purchase receipt ${existing.documentNumber}`,
        });
      }

      return receiptToUpdate;
    }
  }

  // --- Inventory: stock --------------------------------------------------------
  if (seg0 === 'inventory' && seg1 === 'stock') {
    const stockCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg2 === 'levels' && method === 'get') {
      const products = readTable<any>('products');
      const warehouses = readTable<any>('warehouses');
      const units = readTable<any>('units');
      const packageTypes = readTable<any>('packageTypes');
      return genericList('stockLevels')
        .filter((l: any) => l.companyId === stockCompanyId)
        .map((l) => {
        const p = products.find((pp) => pp.id === l.productId) ?? { nameEn: 'Unknown', sku: '' };
        return {
          ...l,
          product: {
            ...p,
            unit: p.unitId ? { nameEn: units.find((u) => u.id === p.unitId)?.nameEn ?? '' } : null,
            packageType: p.packageTypeId
              ? { nameEn: packageTypes.find((pt) => pt.id === p.packageTypeId)?.nameEn ?? '' }
              : null,
          },
          warehouse: warehouses.find((w) => w.id === l.warehouseId) ?? { nameEn: 'Unknown' },
        };
      });
    }
    if (seg2 === 'movements' && method === 'get') {
      const products = readTable<any>('products');
      const warehouses = readTable<any>('warehouses');
      return genericList('stockMovements')
        .filter((m: any) => m.companyId === stockCompanyId)
        .map((m) => ({
          ...m,
          product: products.find((p) => p.id === m.productId) ?? { nameEn: 'Unknown' },
          warehouse: warehouses.find((w) => w.id === m.warehouseId) ?? { nameEn: 'Unknown' },
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (seg2 === 'levels' && seg3 && seg4 === 'location' && method === 'patch') {
      const levels = readTable<any>('stockLevels');
      const level = levels.find((l) => l.id === seg3);
      if (!level) throw new OfflineApiError('Not found');
      level.location = body.location;
      writeTable('stockLevels', levels);
      return level;
    }
    if (seg2 === 'adjustments' && method === 'post') {
      const docNumber = tryGetNextNumber('STOCK_ADJUSTMENT') ?? nextDocNumber('stockMovements', 'ADJ');
      for (const line of body.lines) {
        const delta = Number(line.countedQuantity) - Number(line.systemQuantity);
        if (delta === 0) continue;
        const level = getOrCreateStockLevel(line.productId, body.warehouseId);
        if (delta > 0) {
          receiveStock(line.productId, body.warehouseId, delta, Number(line.unitCost), 'STOCK_ADJUSTMENT', docNumber);
        } else {
          level.quantityOnHand += delta; // delta negative
          saveStockLevel(level);
          addMovement({
            productId: line.productId,
            warehouseId: body.warehouseId,
            type: 'ADJUSTMENT_OUT',
            quantity: Math.abs(delta),
            unitCost: Number(line.unitCost),
            totalCost: Math.abs(delta) * Number(line.unitCost),
            balanceQuantityAfter: level.quantityOnHand,
            balanceAverageCostAfter: level.averageCost,
            referenceType: 'STOCK_ADJUSTMENT',
            referenceNumber: docNumber,
          });
        }
      }
      return { documentNumber: docNumber };
    }
    if (seg2 === 'transfers' && method === 'get') {
      const products = readTable<any>('products');
      const warehouses = readTable<any>('warehouses');
      const users = readTable<any>('users');
      return genericList('stockTransfers')
        .filter((tr: any) => tr.companyId === stockCompanyId)
        .map((tr) => ({
          ...tr,
          fromWarehouse: warehouses.find((w) => w.id === tr.fromWarehouseId) ?? { nameEn: 'Unknown' },
          toWarehouse: warehouses.find((w) => w.id === tr.toWarehouseId) ?? { nameEn: 'Unknown' },
          createdByName: users.find((u) => u.id === tr.createdById)?.fullName ?? '—',
          lines: (tr.lines ?? []).map((l: any) => ({
            ...l,
            product: products.find((p) => p.id === l.productId) ?? { nameEn: 'Unknown', sku: '' },
          })),
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (seg2 === 'transfers' && method === 'post') {
      if (body.fromWarehouseId === body.toWarehouseId) {
        throw new OfflineApiError('Source and destination warehouse must be different');
      }
      const docNumber = tryGetNextNumber('STOCK_TRANSFER') ?? nextDocNumber('stockTransfers', 'TRF');
      const lines = (body.lines ?? []).map((line: any) => {
        const level = getOrCreateStockLevel(line.productId, body.fromWarehouseId);
        const available = Number(level.quantityOnHand);
        const quantity = Number(line.quantity);
        if (quantity > available + 0.0001) {
          throw new OfflineApiError(`Insufficient stock: available ${available}, requested ${quantity}`);
        }
        const unitCost = issueStock(
          line.productId,
          body.fromWarehouseId,
          quantity,
          'STOCK_TRANSFER',
          docNumber,
          'TRANSFER_OUT',
        );
        receiveStock(line.productId, body.toWarehouseId, quantity, unitCost, 'STOCK_TRANSFER', docNumber, 'TRANSFER_IN');
        return { id: genId(), productId: line.productId, quantity };
      });
      return genericCreate(
        'stockTransfers',
        {
          transferDate: body.transferDate,
          fromWarehouseId: body.fromWarehouseId,
          toWarehouseId: body.toWarehouseId,
          status: 'CONFIRMED',
          notes: body.notes ?? null,
          createdById: getOfflineSessionUser()?.id ?? 'offline-demo-user',
          lines,
        },
        { documentNumber: docNumber, createdAt: new Date().toISOString(), companyId: stockCompanyId },
      );
    }
  }

  // --- Inventory: stock audits ("الجرد الشهري", Printing Press only) -----------
  if (seg0 === 'inventory' && seg1 === 'stock-audits') {
    const auditsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    const users = readTable<any>('users');
    const warehouses = readTable<any>('warehouses');
    const branches = readTable<any>('branches');
    const products = readTable<any>('products');

    function hydrateAudit(audit: any) {
      const lines = readTable<any>('stockAuditLines')
        .filter((l) => l.auditId === audit.id)
        .map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) ?? { nameEn: 'Unknown', sku: '' } }));
      const warehouse = warehouses.find((w) => w.id === audit.warehouseId) ?? null;
      // Mirrors StockAuditDetailPage's own totalConsumedValue formula exactly, so the list column
      // (this) and the detail page's header card can never disagree — computed live, never stored.
      const totalConsumedValue = lines.reduce((sum: number, l: any) => {
        if (l.actualQuantity === null || l.actualQuantity === undefined) return sum;
        const newQuantity =
          audit.status === 'APPROVED' ? Number(l.adjustedQuantity ?? l.actualQuantity) : Number(l.actualQuantity);
        const consumed = Number(l.systemQuantity) - newQuantity;
        return sum + consumed * Number(l.unitCost);
      }, 0);
      return {
        ...audit,
        warehouse: warehouse
          ? { ...warehouse, branch: branches.find((b) => b.id === warehouse.branchId) ?? null }
          : null,
        createdByName: users.find((u) => u.id === audit.createdById)?.fullName ?? '—',
        approvedByName: audit.approvedById ? (users.find((u) => u.id === audit.approvedById)?.fullName ?? '—') : undefined,
        lines,
        totalConsumedValue,
      };
    }

    // Applies one line's quantity delta to real stock — shared by approve() (original
    // application), and by the edit/delete paths below for reversing an already-applied delta
    // (called with the negated delta) and/or reapplying a corrected one. Mirrors
    // StockAdjustmentsService.create()'s per-line receive/issue branching exactly.
    function applyStockAuditLineDelta(
      productId: string,
      warehouseId: string,
      delta: number,
      unitCost: number,
      referenceNumber: string,
    ) {
      if (delta === 0) return;
      if (delta > 0) {
        receiveStock(productId, warehouseId, delta, unitCost, 'STOCK_ADJUSTMENT', referenceNumber);
        return;
      }
      const level = getOrCreateStockLevel(productId, warehouseId);
      level.quantityOnHand += delta; // delta negative
      saveStockLevel(level);
      addMovement({
        productId,
        warehouseId,
        type: 'ADJUSTMENT_OUT',
        quantity: Math.abs(delta),
        unitCost,
        totalCost: Math.abs(delta) * unitCost,
        balanceQuantityAfter: level.quantityOnHand,
        balanceAverageCostAfter: level.averageCost,
        referenceType: 'STOCK_ADJUSTMENT',
        referenceNumber,
      });
    }

    if (!seg2 && method === 'get') {
      return readTable<any>('stockAudits')
        .filter((a) => a.companyId === auditsCompanyId)
        .map(hydrateAudit)
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    if (seg2 && !seg3 && method === 'get') {
      const audit = readTable<any>('stockAudits').find((a) => a.id === seg2 && a.companyId === auditsCompanyId);
      if (!audit) throw new OfflineApiError('Stock audit not found');
      return hydrateAudit(audit);
    }

    if (!seg2 && method === 'post') {
      const warehouse = warehouses.find((w) => w.id === body.warehouseId && w.companyId === auditsCompanyId);
      if (!warehouse) throw new OfflineApiError('Warehouse not found');

      const documentNumber = tryGetNextNumber('STOCK_AUDIT') ?? nextDocNumber('stockAudits', 'AUDIT', auditsCompanyId);
      const audit = genericCreate(
        'stockAudits',
        {
          auditDate: body.auditDate,
          warehouseId: body.warehouseId,
          notes: body.notes ?? null,
          status: 'CONFIRMED',
          createdById: getOfflineSessionUser()?.id ?? 'offline-demo-user',
          approvedById: null,
          approvedAt: null,
          stockAdjustmentId: null,
        },
        { documentNumber, createdAt: new Date().toISOString(), companyId: auditsCompanyId },
      );

      const auditLines = readTable<any>('stockAuditLines');
      for (const line of body.lines ?? []) {
        auditLines.push({
          id: genId(),
          auditId: audit.id,
          productId: line.productId,
          systemQuantity: Number(line.systemQuantity),
          actualQuantity: line.actualQuantity === null || line.actualQuantity === undefined ? null : Number(line.actualQuantity),
          adjustedQuantity: null,
          unitCost: Number(line.unitCost),
        });
      }
      writeTable('stockAuditLines', auditLines);

      return hydrateAudit(audit);
    }

    // Edits an audit's header (month/date, notes) and/or its lines' counted quantities — mirrors
    // StockAuditsService.update(). A CONFIRMED audit hasn't moved stock yet, so line edits are a
    // plain field update. An APPROVED audit already moved real stock via approve() — editing its
    // lines here reverses that original effect first (negated delta) then reapplies a fresh
    // adjustment for the new counts.
    if (seg2 && !seg3 && method === 'patch') {
      const audits = readTable<any>('stockAudits');
      const audit = audits.find((a) => a.id === seg2 && a.companyId === auditsCompanyId);
      if (!audit) throw new OfflineApiError('Stock audit not found');

      if (body.auditDate !== undefined) audit.auditDate = body.auditDate;
      if (body.notes !== undefined) audit.notes = body.notes;

      if (body.lines) {
        const wasApproved = audit.status === 'APPROVED';
        const allAuditLines = readTable<any>('stockAuditLines');
        const auditLines = allAuditLines.filter((l) => l.auditId === audit.id);

        if (wasApproved) {
          const countedBefore = auditLines.filter((l) => l.actualQuantity !== null);
          if (countedBefore.length > 0) {
            const reverseDocNumber = tryGetNextNumber('STOCK_ADJUSTMENT') ?? nextDocNumber('stockMovements', 'ADJ');
            for (const line of countedBefore) {
              // Reverses adjustedQuantity (the value actually written to stock at approval,
              // possibly admin-overridden), not actualQuantity — an overridden line would
              // otherwise reverse to the wrong stock level.
              const appliedQuantity = line.adjustedQuantity ?? line.actualQuantity;
              const reverseDelta = Number(line.systemQuantity) - Number(appliedQuantity);
              applyStockAuditLineDelta(line.productId, audit.warehouseId, reverseDelta, Number(line.unitCost), reverseDocNumber);
            }
          }
        }

        const newActualByProductId = new Map(
          (body.lines as any[]).map((l) => [l.productId, l.actualQuantity === null || l.actualQuantity === undefined ? null : Number(l.actualQuantity)]),
        );
        for (const line of auditLines) {
          if (newActualByProductId.has(line.productId)) {
            line.actualQuantity = newActualByProductId.get(line.productId);
            // Editing the count invalidates any prior admin override — reset here, and, if the
            // audit is already approved, re-set to match the freshly reapplied value below.
            line.adjustedQuantity = null;
          }
        }
        writeTable('stockAuditLines', allAuditLines);

        if (wasApproved) {
          const countedAfter = auditLines.filter((l) => l.actualQuantity !== null);
          if (countedAfter.length > 0) {
            const reapplyDocNumber = tryGetNextNumber('STOCK_ADJUSTMENT') ?? nextDocNumber('stockMovements', 'ADJ');
            for (const line of countedAfter) {
              const delta = Number(line.actualQuantity) - Number(line.systemQuantity);
              applyStockAuditLineDelta(line.productId, audit.warehouseId, delta, Number(line.unitCost), reapplyDocNumber);
              line.adjustedQuantity = Number(line.actualQuantity);
            }
            audit.stockAdjustmentId = reapplyDocNumber;
            writeTable('stockAuditLines', allAuditLines);
          } else {
            audit.stockAdjustmentId = null;
          }
        }
      }

      writeTable('stockAudits', audits);
      return hydrateAudit(audit);
    }

    // Deletes an audit and its lines — mirrors StockAuditsService.remove(). A CONFIRMED audit
    // never moved stock, so this is a plain delete. An APPROVED audit already moved real stock via
    // approve() — this reverses that effect first (same negated-delta trick as the edit path
    // above) before removing the record.
    if (seg2 && !seg3 && method === 'delete') {
      const audits = readTable<any>('stockAudits');
      const audit = audits.find((a) => a.id === seg2 && a.companyId === auditsCompanyId);
      if (!audit) throw new OfflineApiError('Stock audit not found');

      if (audit.status === 'APPROVED') {
        const counted = readTable<any>('stockAuditLines').filter((l) => l.auditId === audit.id && l.actualQuantity !== null);
        if (counted.length > 0) {
          const reverseDocNumber = tryGetNextNumber('STOCK_ADJUSTMENT') ?? nextDocNumber('stockMovements', 'ADJ');
          for (const line of counted) {
            // Reverses adjustedQuantity (the value actually written to stock at approval,
            // possibly admin-overridden), not actualQuantity — see the PATCH handler above.
            const appliedQuantity = line.adjustedQuantity ?? line.actualQuantity;
            const reverseDelta = Number(line.systemQuantity) - Number(appliedQuantity);
            applyStockAuditLineDelta(line.productId, audit.warehouseId, reverseDelta, Number(line.unitCost), reverseDocNumber);
          }
        }
      }

      writeTable(
        'stockAudits',
        audits.filter((a) => a.id !== seg2),
      );
      writeTable(
        'stockAuditLines',
        readTable<any>('stockAuditLines').filter((l) => l.auditId !== seg2),
      );
      return { deleted: true };
    }

    if (seg2 && seg3 === 'approve' && method === 'post') {
      const audits = readTable<any>('stockAudits');
      const audit = audits.find((a) => a.id === seg2 && a.companyId === auditsCompanyId);
      if (!audit) throw new OfflineApiError('Stock audit not found');
      if (audit.status !== 'CONFIRMED') {
        throw new OfflineApiError('Only a submitted (pending-approval) audit can be approved');
      }

      // Only this approval step ever moves real stock — reuses applyStockAuditLineDelta (same
      // delta-application logic as the /inventory/stock/adjustments POST handler above). An admin
      // reviewing the pending audit can override each line's final quantity ("كمية المخزون
      // الجديدة") before approving — defaults to actualQuantity when left untouched. That final
      // value is what's actually written to stock, and is persisted on the line afterward for its
      // locked, read-only display once approved.
      const overrideByProductId = new Map<string, number>(
        ((body?.lines ?? []) as any[]).map((l) => [l.productId, Number(l.adjustedQuantity)]),
      );
      const allLines = readTable<any>('stockAuditLines');
      const lines = allLines.filter((l) => l.auditId === audit.id && l.actualQuantity !== null);
      if (lines.length > 0) {
        const adjDocNumber = tryGetNextNumber('STOCK_ADJUSTMENT') ?? nextDocNumber('stockMovements', 'ADJ');
        for (const line of lines) {
          const finalQuantity = overrideByProductId.has(line.productId)
            ? overrideByProductId.get(line.productId)!
            : Number(line.actualQuantity);
          const delta = finalQuantity - Number(line.systemQuantity);
          applyStockAuditLineDelta(line.productId, audit.warehouseId, delta, Number(line.unitCost), adjDocNumber);
          line.adjustedQuantity = finalQuantity;
        }
        audit.stockAdjustmentId = adjDocNumber;
        writeTable('stockAuditLines', allLines);
      }

      audit.status = 'APPROVED';
      audit.approvedById = getOfflineSessionUser()?.id ?? 'offline-demo-user';
      audit.approvedAt = new Date().toISOString();
      writeTable('stockAudits', audits);
      return hydrateAudit(audit);
    }
  }

  // --- HR: Employees ------------------------------------------------------------
  // "الموظفين" — applies to every company/branch, not just Printing Press.
  if (seg0 === 'hr' && seg1 === 'employees') {
    const hrCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    const branches = readTable<any>('branches');

    function hydrateEmployee(employee: any) {
      return { ...employee, branch: branches.find((b) => b.id === employee.branchId) ?? null };
    }

    if (!seg2 && method === 'get') {
      let list = readTable<any>('employees').filter((e) => e.companyId === hrCompanyId);
      if (params?.branchId) list = list.filter((e) => e.branchId === params.branchId);
      if (params?.search) {
        const q = String(params.search).toLowerCase();
        list = list.filter(
          (e) => String(e.name).toLowerCase().includes(q) || String(e.jobTitle).toLowerCase().includes(q),
        );
      }
      return list.map(hydrateEmployee).sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    // GET /hr/employees/:id/history?year=&month= — checked before the generic
    // "GET /hr/employees/:id" handler below, which would otherwise also match on seg2 alone.
    if (seg2 && seg3 === 'history' && method === 'get') {
      return buildEmployeeHistory(seg2, hrCompanyId, Number(params?.year), params?.month ? Number(params.month) : undefined);
    }

    if (seg2 && seg3 === 'leaves' && !seg4 && method === 'post') {
      const employee = readTable<any>('employees').find((e) => e.id === seg2 && e.companyId === hrCompanyId);
      if (!employee) throw new OfflineApiError('Employee not found');
      if (body.endDate < body.startDate) throw new OfflineApiError('تاريخ النهاية يجب أن يكون بعد تاريخ البداية');
      const createdById = getOfflineSessionUser()?.id ?? 'offline-demo-user';
      return genericCreate(
        'employeeLeaves',
        {
          employeeId: seg2,
          startDate: body.startDate,
          endDate: body.endDate,
          type: body.type,
          notes: body.notes ?? null,
          createdById,
        },
        { companyId: hrCompanyId, createdAt: new Date().toISOString() },
      );
    }

    if (seg2 && seg3 === 'leaves' && seg4 && method === 'delete') {
      const leave = readTable<any>('employeeLeaves').find(
        (l) => l.id === seg4 && l.employeeId === seg2 && l.companyId === hrCompanyId,
      );
      if (!leave) throw new OfflineApiError('Leave record not found');
      return genericDelete('employeeLeaves', seg4);
    }

    if (seg2 && !seg3 && method === 'get') {
      const employee = readTable<any>('employees').find((e) => e.id === seg2 && e.companyId === hrCompanyId);
      if (!employee) throw new OfflineApiError('Employee not found');
      return hydrateEmployee(employee);
    }

    if (!seg2 && method === 'post') {
      const employee = genericCreate(
        'employees',
        {
          name: body.name,
          jobTitle: body.jobTitle,
          branchId: body.branchId,
          baseSalary: Number(body.baseSalary),
          isActive: body.isActive ?? true,
        },
        { companyId: hrCompanyId, createdAt: new Date().toISOString() },
      );
      return hydrateEmployee(employee);
    }

    if (seg2 && !seg3 && method === 'patch') {
      const employees = readTable<any>('employees');
      const employee = employees.find((e) => e.id === seg2 && e.companyId === hrCompanyId);
      if (!employee) throw new OfflineApiError('Employee not found');
      if (body.name !== undefined) employee.name = body.name;
      if (body.jobTitle !== undefined) employee.jobTitle = body.jobTitle;
      if (body.branchId !== undefined) employee.branchId = body.branchId;
      if (body.baseSalary !== undefined) employee.baseSalary = Number(body.baseSalary);
      if (body.isActive !== undefined) employee.isActive = body.isActive;
      writeTable('employees', employees);
      return hydrateEmployee(employee);
    }

    if (seg2 && !seg3 && method === 'delete') {
      const hasPayrollHistory = readTable<any>('payrollRunLines').some((l) => l.employeeId === seg2);
      if (hasPayrollHistory) {
        throw new OfflineApiError('Cannot delete an employee with payroll history — deactivate instead');
      }
      return genericDelete('employees', seg2);
    }
  }

  // --- HR: Payroll runs -----------------------------------------------------------
  // Mirrors PayrollService: create() only snapshots+computes, never touches CashMovement;
  // approve() is the one place that posts net salaries, one CashMovement per branch, and can
  // only run once per run (CONFIRMED→APPROVED is one-way) — see cash-movements.service.ts's
  // getExpenseReport() sourceType filter and this file's buildExpenseReport() mirror, both
  // updated to include sourceType PAYROLL alongside MANUAL.
  if (seg0 === 'hr' && seg1 === 'payroll-runs') {
    const payrollCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    const employees = readTable<any>('employees');
    const branches = readTable<any>('branches');
    const users = readTable<any>('users');

    function hydratePayrollRun(run: any) {
      const lines = readTable<any>('payrollRunLines')
        .filter((l) => l.payrollRunId === run.id)
        .map((l) => ({
          ...l,
          employee: employees.find((e) => e.id === l.employeeId) ?? null,
          branch: branches.find((b) => b.id === l.branchId) ?? null,
        }));
      return {
        ...run,
        createdByName: users.find((u) => u.id === run.createdById)?.fullName ?? '—',
        approvedByName: run.approvedById ? (users.find((u) => u.id === run.approvedById)?.fullName ?? '—') : undefined,
        lines,
      };
    }

    if (!seg2 && method === 'get') {
      return readTable<any>('payrollRuns')
        .filter((r) => r.companyId === payrollCompanyId)
        .map(hydratePayrollRun)
        .sort((a: any, b: any) => (a.year !== b.year ? b.year - a.year : b.month - a.month));
    }

    if (seg2 && !seg3 && method === 'get') {
      const run = readTable<any>('payrollRuns').find((r) => r.id === seg2 && r.companyId === payrollCompanyId);
      if (!run) throw new OfflineApiError('Payroll run not found');
      return hydratePayrollRun(run);
    }

    // Mirrors PayrollService.create(): for every non-Press company this still just saves a
    // CONFIRMED run (unchanged from before, no CashMovement touched). For the Printing Press,
    // body.paymentAccount is required, and the run's total net salary is balance-checked against
    // that account BEFORE anything is written — an insufficient balance throws and leaves no
    // orphaned run behind — then the run is written already APPROVED with its CashMovement(s)
    // posted, since "حفظ واعتماد الكشف" is a single action for Press, not a two-step create+approve.
    if (!seg2 && method === 'post') {
      const existing = readTable<any>('payrollRuns').find(
        (r) => r.companyId === payrollCompanyId && r.year === Number(body.year) && r.month === Number(body.month),
      );
      if (existing) throw new OfflineApiError('A payroll run for this month already exists');

      const employeeById = new Map(employees.filter((e) => e.companyId === payrollCompanyId).map((e) => [e.id, e]));
      for (const l of body.lines ?? []) {
        if (!employeeById.has(l.employeeId)) throw new OfflineApiError('One or more employees not found');
      }

      const company = readTable<any>('companies').find((c) => c.id === payrollCompanyId);
      const isPress = company?.code === 'PRESS';
      if (isPress && !body.paymentAccount) {
        throw new OfflineApiError('يجب اختيار مصدر الصرف (الكاش أو البنك)');
      }

      const computedLines = (body.lines ?? []).map((l: any) => {
        const employee = employeeById.get(l.employeeId)!;
        const baseSalary = Number(employee.baseSalary);
        const dailyRate = baseSalary / 30;
        const hourlyRate = dailyRate / 8;
        const absenceDays = Number(l.absenceDays ?? 0);
        const lateHours = Number(l.lateHours ?? 0);
        const otherDeductions = Number(l.otherDeductions ?? 0);
        const absenceDeduction = dailyRate * absenceDays;
        const lateDeduction = hourlyRate * lateHours;
        const netSalary = Math.max(0, baseSalary - absenceDeduction - lateDeduction - otherDeductions);
        return {
          employeeId: employee.id,
          branchId: employee.branchId,
          baseSalary,
          absenceDays,
          lateHours,
          otherDeductions,
          absenceDeduction,
          lateDeduction,
          netSalary,
        };
      });

      if (isPress) {
        const totalNetSalary = computedLines.reduce((sum: number, l: any) => sum + l.netSalary, 0);
        assertSufficientBalance(payrollCompanyId, body.paymentAccount, totalNetSalary, undefined);
      }

      const documentNumber = tryGetNextNumber('PAYROLL_RUN') ?? nextDocNumber('payrollRuns', 'PR', payrollCompanyId);
      const run = genericCreate(
        'payrollRuns',
        {
          year: Number(body.year),
          month: Number(body.month),
          notes: body.notes ?? null,
          status: 'CONFIRMED',
          paymentAccount: isPress ? body.paymentAccount : null,
          createdById: getOfflineSessionUser()?.id ?? 'offline-demo-user',
          approvedById: null,
          approvedAt: null,
        },
        { documentNumber, companyId: payrollCompanyId, createdAt: new Date().toISOString() },
      );

      const runLines = readTable<any>('payrollRunLines');
      for (const l of computedLines) {
        runLines.push({ id: genId(), payrollRunId: run.id, ...l });
      }
      writeTable('payrollRunLines', runLines);

      if (isPress) {
        const lastDay = new Date(run.year, run.month, 0).getDate();
        const movementDate = `${run.year}-${String(run.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        const totalsByBranch = new Map<string, number>();
        for (const l of computedLines) {
          totalsByBranch.set(l.branchId, (totalsByBranch.get(l.branchId) ?? 0) + l.netSalary);
        }
        for (const [branchId, amount] of totalsByBranch) {
          if (amount <= 0) continue;
          recordCashMovement({
            companyId: payrollCompanyId,
            branchId,
            movementDate,
            type: 'EXPENSE',
            account: body.paymentAccount,
            amount,
            sourceType: 'PAYROLL',
            sourceId: run.id,
            category: 'رواتب الموظفين',
            description: `رواتب شهر ${run.month}/${run.year} - ${run.documentNumber}`,
            createdById: getOfflineSessionUser()?.id ?? 'offline-demo-user',
          });
        }
        run.status = 'APPROVED';
        run.approvedById = getOfflineSessionUser()?.id ?? 'offline-demo-user';
        run.approvedAt = new Date().toISOString();
        const runsAfter = readTable<any>('payrollRuns');
        const idx = runsAfter.findIndex((r) => r.id === run.id);
        if (idx !== -1) runsAfter[idx] = run;
        writeTable('payrollRuns', runsAfter);
      }

      return hydratePayrollRun(run);
    }

    // Defensive-only path today: Press runs are already APPROVED by the create handler above, so
    // this only ever fires for a non-Press CONFIRMED run's manual approval, or a CONFIRMED Press run
    // that somehow exists without having gone through create()'s auto-approve.
    if (seg2 && seg3 === 'approve' && method === 'post') {
      const runs = readTable<any>('payrollRuns');
      const run = runs.find((r) => r.id === seg2 && r.companyId === payrollCompanyId);
      if (!run) throw new OfflineApiError('Payroll run not found');
      if (run.status !== 'CONFIRMED') {
        throw new OfflineApiError('Only a submitted (pending-approval) payroll run can be approved');
      }

      const company = readTable<any>('companies').find((c) => c.id === payrollCompanyId);
      const isPress = company?.code === 'PRESS';
      const account = run.paymentAccount ?? 'CASH';
      const lines = readTable<any>('payrollRunLines').filter((l) => l.payrollRunId === run.id);
      if (isPress) {
        if (!run.paymentAccount) throw new OfflineApiError('يجب اختيار مصدر الصرف (الكاش أو البنك)');
        const totalNetSalary = lines.reduce((sum, l) => sum + Number(l.netSalary), 0);
        assertSufficientBalance(payrollCompanyId, account, totalNetSalary, undefined);
      }

      const totalsByBranch = new Map<string, number>();
      for (const line of lines) {
        totalsByBranch.set(line.branchId, (totalsByBranch.get(line.branchId) ?? 0) + Number(line.netSalary));
      }

      const lastDay = new Date(run.year, run.month, 0).getDate();
      const movementDate = `${run.year}-${String(run.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      for (const [branchId, amount] of totalsByBranch) {
        if (amount <= 0) continue;
        recordCashMovement({
          companyId: payrollCompanyId,
          branchId,
          movementDate,
          type: 'EXPENSE',
          account,
          amount,
          sourceType: 'PAYROLL',
          sourceId: run.id,
          category: 'رواتب الموظفين',
          description: `رواتب شهر ${run.month}/${run.year} - ${run.documentNumber}`,
          createdById: getOfflineSessionUser()?.id ?? 'offline-demo-user',
        });
      }

      run.status = 'APPROVED';
      run.approvedById = getOfflineSessionUser()?.id ?? 'offline-demo-user';
      run.approvedAt = new Date().toISOString();
      writeTable('payrollRuns', runs);
      return hydratePayrollRun(run);
    }

    // Recomputes each line's deductions/net salary from its own snapshot baseSalary (mirrors
    // PayrollService.update()). If the run is already APPROVED, its previously-posted CashMovement
    // rows (sourceType PAYROLL, sourceId = run.id) are removed and re-posted with the corrected
    // totals in the same call — no separate "unapprove" step needed.
    if (seg2 && !seg3 && method === 'patch') {
      const runs = readTable<any>('payrollRuns');
      const run = runs.find((r) => r.id === seg2 && r.companyId === payrollCompanyId);
      if (!run) throw new OfflineApiError('Payroll run not found');

      const runLines = readTable<any>('payrollRunLines');
      const lineByEmployeeId = new Map(
        runLines.filter((l) => l.payrollRunId === run.id).map((l) => [l.employeeId, l]),
      );
      for (const dtoLine of body.lines ?? []) {
        const line = lineByEmployeeId.get(dtoLine.employeeId);
        if (!line) throw new OfflineApiError(`No payroll line found for employee ${dtoLine.employeeId} on this run`);
        const baseSalary = Number(line.baseSalary);
        const dailyRate = baseSalary / 30;
        const hourlyRate = dailyRate / 8;
        line.absenceDays = Number(dtoLine.absenceDays ?? 0);
        line.lateHours = Number(dtoLine.lateHours ?? 0);
        line.otherDeductions = Number(dtoLine.otherDeductions ?? 0);
        line.absenceDeduction = dailyRate * line.absenceDays;
        line.lateDeduction = hourlyRate * line.lateHours;
        line.netSalary = Math.max(0, baseSalary - line.absenceDeduction - line.lateDeduction - line.otherDeductions);
      }
      writeTable('payrollRunLines', runLines);

      if (body.notes !== undefined) run.notes = body.notes;

      if (run.status === 'APPROVED') {
        writeTable(
          'cashMovements',
          readTable<any>('cashMovements').filter(
            (m: any) => !(m.companyId === payrollCompanyId && m.sourceType === 'PAYROLL' && m.sourceId === run.id),
          ),
        );

        // The removal above already takes the old posting out of the balance before this checks —
        // no excludeAmount add-back needed. No-ops for every non-Press company.
        const account = run.paymentAccount ?? 'CASH';
        const freshLines = runLines.filter((l) => l.payrollRunId === run.id);
        const totalNetSalary = freshLines.reduce((sum, l) => sum + Number(l.netSalary), 0);
        assertSufficientBalance(payrollCompanyId, account, totalNetSalary, undefined);

        const totalsByBranch = new Map<string, number>();
        for (const line of freshLines) {
          totalsByBranch.set(line.branchId, (totalsByBranch.get(line.branchId) ?? 0) + Number(line.netSalary));
        }
        const lastDay = new Date(run.year, run.month, 0).getDate();
        const movementDate = `${run.year}-${String(run.month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        for (const [branchId, amount] of totalsByBranch) {
          if (amount <= 0) continue;
          recordCashMovement({
            companyId: payrollCompanyId,
            branchId,
            movementDate,
            type: 'EXPENSE',
            account,
            amount,
            sourceType: 'PAYROLL',
            sourceId: run.id,
            category: 'رواتب الموظفين',
            description: `رواتب شهر ${run.month}/${run.year} - ${run.documentNumber}`,
            createdById: getOfflineSessionUser()?.id ?? 'offline-demo-user',
          });
        }
      }

      writeTable('payrollRuns', runs);
      return hydratePayrollRun(run);
    }

    // Deletes the run and its lines (mirrors PayrollService.remove()). If the run was already
    // APPROVED, its posted CashMovement rows are reversed first so a deleted run never leaves a
    // dangling operating-expense entry behind.
    if (seg2 && !seg3 && method === 'delete') {
      const runs = readTable<any>('payrollRuns');
      const run = runs.find((r) => r.id === seg2 && r.companyId === payrollCompanyId);
      if (!run) throw new OfflineApiError('Payroll run not found');

      if (run.status === 'APPROVED') {
        writeTable(
          'cashMovements',
          readTable<any>('cashMovements').filter(
            (m: any) => !(m.companyId === payrollCompanyId && m.sourceType === 'PAYROLL' && m.sourceId === run.id),
          ),
        );
      }

      writeTable('payrollRuns', runs.filter((r) => r.id !== seg2));
      writeTable('payrollRunLines', readTable<any>('payrollRunLines').filter((l) => l.payrollRunId !== seg2));
      return { deleted: true };
    }
  }

  // --- Inventory: warehouse view -----------------------------------------------
  if (seg0 === 'inventory' && seg1 === 'warehouse-view') {
    const products = readTable<any>('products');
    const categories = readTable<any>('productCategories');
    const brands = readTable<any>('brands');
    const units = readTable<any>('units');
    const packageTypes = readTable<any>('packageTypes');
    const warehouses = readTable<any>('warehouses');
    const allStockLevels = readTable<any>('stockLevels');

    // Stock status (in/low/out) is a company-wide question — a product isn't "out of stock" just
    // because the warehouse being viewed happens to be empty of it. Every status classification
    // below compares against this cross-warehouse total, never a single row's quantityOnHand.
    function companyQty(productId: string): number {
      return allStockLevels
        .filter((l) => l.productId === productId)
        .reduce((sum, l) => sum + Number(l.quantityOnHand ?? 0), 0);
    }

    if (seg2 && seg3 === 'summary' && method === 'get') {
      const levels = allStockLevels.filter((l) => l.warehouseId === seg2);
      let totalPackageQuantity = 0;
      let totalUnits = 0;
      let totalValue = 0;
      let lowStockItems = 0;
      let outOfStockItems = 0;
      for (const l of levels) {
        const p = products.find((pp) => pp.id === l.productId);
        const reorderLevel = Number(p?.reorderLevel ?? 0);
        const qty = Number(l.quantityOnHand ?? 0);
        const unitsPerPackage = Number(p?.unitsPerPackage) || 1;
        const packages = qty / unitsPerPackage;
        const packageCost = Number(l.averageCost ?? 0) * unitsPerPackage;
        totalPackageQuantity += packages;
        totalUnits += qty;
        totalValue += packages * packageCost;
        const total = companyQty(l.productId);
        if (total <= 0) outOfStockItems++;
        else if (total <= reorderLevel) lowStockItems++;
      }
      return { totalProducts: levels.length, totalPackageQuantity, totalUnits, totalValue, lowStockItems, outOfStockItems };
    }

    if (seg2 && seg3 === 'products' && method === 'get') {
      const levels = allStockLevels.filter((l) => l.warehouseId === seg2);

      let items = levels.map((l) => {
        const p = products.find((pp) => pp.id === l.productId) ?? {};
        const qty = Number(l.quantityOnHand ?? 0);
        const reorderLevel = Number(p.reorderLevel ?? 0);
        const total = companyQty(l.productId);
        const status = total <= 0 ? 'out' : total <= reorderLevel ? 'low' : 'in';
        return {
          stockLevelId: l.id,
          productId: p.id ?? l.productId,
          sku: p.sku,
          barcode: p.barcode,
          nameEn: p.nameEn ?? 'Unknown',
          nameAr: p.nameAr,
          category: p.categoryId
            ? { id: p.categoryId, name: categories.find((c) => c.id === p.categoryId)?.nameEn ?? '' }
            : null,
          brand: p.brandId ? { id: p.brandId, name: brands.find((b) => b.id === p.brandId)?.nameEn ?? '' } : null,
          unit: p.unitId
            ? {
                id: p.unitId,
                code: units.find((u) => u.id === p.unitId)?.code ?? '',
                name: units.find((u) => u.id === p.unitId)?.nameEn ?? '',
              }
            : null,
          packageType: p.packageTypeId
            ? {
                id: p.packageTypeId,
                code: packageTypes.find((pt) => pt.id === p.packageTypeId)?.code ?? '',
                name: packageTypes.find((pt) => pt.id === p.packageTypeId)?.nameEn ?? '',
              }
            : null,
          unitsPerPackage: p.unitsPerPackage ?? null,
          quantityOnHand: qty,
          packageBreakdown: p.unitsPerPackage
            ? { packages: Math.floor(qty / p.unitsPerPackage), remainderUnits: qty % p.unitsPerPackage }
            : null,
          reservedQuantity: Number(l.reservedQuantity ?? 0),
          minimumStock: reorderLevel,
          purchasePrice: Number(p.purchasePrice ?? 0),
          sellingPrice: Number(p.sellingPrice ?? 0),
          packagePurchasePrice: p.packagePurchasePrice ?? null,
          packageSellingPrice: p.packageSellingPrice ?? null,
          location: l.location ?? null,
          status,
          updatedAt: l.updatedAt ?? new Date().toISOString(),
        };
      });

      const search = String(params?.search ?? '').toLowerCase();
      if (search) {
        items = items.filter((i) =>
          [i.sku, i.barcode, i.nameEn, i.nameAr].some((v) => (v ?? '').toLowerCase().includes(search)),
        );
      }
      if (params?.categoryId) items = items.filter((i) => i.category?.id === params.categoryId);
      if (params?.brandId) items = items.filter((i) => i.brand?.id === params.brandId);
      if (params?.status) items = items.filter((i) => i.status === params.status);

      const sortKeyMap: Record<string, (i: any) => any> = {
        code: (i) => i.sku ?? '',
        barcode: (i) => i.barcode ?? '',
        name: (i) => i.nameEn,
        category: (i) => i.category?.name ?? '',
        brand: (i) => i.brand?.name ?? '',
        unit: (i) => i.unit?.name ?? '',
        packageType: (i) => i.packageType?.name ?? '',
        quantity: (i) => i.quantityOnHand,
        reserved: (i) => i.reservedQuantity,
        minStock: (i) => i.minimumStock,
        purchasePrice: (i) => i.purchasePrice,
        sellingPrice: (i) => i.sellingPrice,
        packagePurchasePrice: (i) => i.packagePurchasePrice ?? -1,
        packageSellingPrice: (i) => i.packageSellingPrice ?? -1,
        location: (i) => i.location ?? '',
        updatedAt: (i) => i.updatedAt,
      };
      const keyFn = sortKeyMap[params?.sortBy ?? ''] ?? sortKeyMap.name;
      const dir = params?.sortOrder === 'DESC' ? -1 : 1;
      items.sort((a, b) => {
        const av = keyFn(a);
        const bv = keyFn(b);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });

      const page = Number(params?.page ?? 1);
      const limit = Number(params?.limit ?? 20);
      const total = items.length;
      const paged = items.slice((page - 1) * limit, page * limit);
      return { items: paged, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
    }

    if (seg2 === 'products' && seg3 && method === 'get') {
      const productId = seg3;
      const product = products.find((p) => p.id === productId) ?? {};
      const levels = readTable<any>('stockLevels').filter((l) => l.productId === productId);
      const movements = readTable<any>('stockMovements')
        .filter((m) => m.productId === productId)
        .slice(0, 100);
      const salesInvoices = readTable<any>('salesInvoices');
      const customers = readTable<any>('customers');

      const salesHistory: any[] = [];
      for (const inv of salesInvoices) {
        for (const line of inv.lines ?? []) {
          if (line.productId !== productId) continue;
          salesHistory.push({
            documentNumber: inv.documentNumber,
            date: inv.invoiceDate,
            customerName: customers.find((c) => c.id === inv.customerId)?.name ?? 'Unknown',
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          });
        }
      }

      return {
        product: {
          id: product.id ?? productId,
          sku: product.sku,
          barcode: product.barcode,
          nameEn: product.nameEn ?? 'Unknown',
          nameAr: product.nameAr,
          category: product.categoryId
            ? { id: product.categoryId, name: categories.find((c) => c.id === product.categoryId)?.nameEn ?? '' }
            : null,
          brand: product.brandId
            ? { id: product.brandId, name: brands.find((b) => b.id === product.brandId)?.nameEn ?? '' }
            : null,
          unit: product.unitId
            ? { id: product.unitId, name: units.find((u) => u.id === product.unitId)?.nameEn ?? '' }
            : null,
          purchasePrice: Number(product.purchasePrice ?? 0),
          sellingPrice: Number(product.sellingPrice ?? 0),
          averageCost: Number(product.averageCost ?? 0),
          reorderLevel: Number(product.reorderLevel ?? 0),
          imageUrl: product.imageUrl,
          packageType: product.packageTypeId
            ? {
                id: product.packageTypeId,
                name: packageTypes.find((pt) => pt.id === product.packageTypeId)?.nameEn ?? '',
              }
            : null,
          unitsPerPackage: product.unitsPerPackage ?? null,
          packagePurchasePrice: product.packagePurchasePrice ?? null,
          packageSellingPrice: product.packageSellingPrice ?? null,
          notes: product.notes,
          isActive: product.isActive ?? true,
        },
        stockByWarehouse: levels.map((l) => ({
          warehouseId: l.warehouseId,
          warehouseCode: warehouses.find((w) => w.id === l.warehouseId)?.code ?? '',
          warehouseName: warehouses.find((w) => w.id === l.warehouseId)?.nameEn ?? 'Unknown',
          quantityOnHand: Number(l.quantityOnHand ?? 0),
          reservedQuantity: Number(l.reservedQuantity ?? 0),
          location: l.location ?? null,
          packageBreakdown: product.unitsPerPackage
            ? {
                packages: Math.floor(Number(l.quantityOnHand ?? 0) / product.unitsPerPackage),
                remainderUnits: Number(l.quantityOnHand ?? 0) % product.unitsPerPackage,
              }
            : null,
        })),
        movements: movements.map((m) => ({
          id: m.id,
          date: m.createdAt,
          type: m.type,
          warehouseName: warehouses.find((w) => w.id === m.warehouseId)?.nameEn,
          quantity: m.quantity,
          unitCost: m.unitCost,
          totalCost: m.totalCost,
          referenceNumber: m.referenceNumber,
        })),
        purchaseHistory: [],
        salesHistory,
        supplier: null,
      };
    }
  }

  // --- Sales: quotations -------------------------------------------------------
  if (seg0 === 'sales' && seg1 === 'quotations') {
    const quotationsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg2 && method === 'get') {
      const quotation = findOne<any>('quotations', seg2);
      if (quotation.companyId !== quotationsCompanyId) throw new OfflineApiError('Not found');
      const customers = readTable<any>('customers');
      const reps = readTable<any>('salesRepresentatives');
      const products = readTable<any>('products');
      const units = readTable<any>('units');
      const packageTypes = readTable<any>('packageTypes');
      return {
        ...quotation,
        customer: customers.find((c) => c.id === quotation.customerId) ?? { id: quotation.customerId, name: 'Unknown' },
        salesRepresentative: quotation.salesRepresentativeId
          ? reps.find((r) => r.id === quotation.salesRepresentativeId) ?? null
          : null,
        lines: (quotation.lines ?? []).map((l: any) => {
          const p = products.find((pp) => pp.id === l.productId) ?? { sku: '', nameEn: 'Unknown' };
          return {
            ...l,
            product: {
              ...p,
              unit: p.unitId ? { nameEn: units.find((u) => u.id === p.unitId)?.nameEn ?? '' } : null,
              packageType: p.packageTypeId
                ? { nameEn: packageTypes.find((pt) => pt.id === p.packageTypeId)?.nameEn ?? '' }
                : null,
            },
          };
        }),
      };
    }
    if (!seg2 && method === 'get') {
      const customers = readTable<any>('customers');
      const reps = readTable<any>('salesRepresentatives');
      // Branch-scoped exactly like the Sales report's "الفرع" filter: a non-admin pinned to a
      // branch (via their own linked SalesRepresentative) only ever sees that branch's quotations.
      const quotationsBranchId = resolveOfflineBranchId(undefined);
      return genericList('quotations')
        .filter((q: any) => q.companyId === quotationsCompanyId && (!quotationsBranchId || q.branchId === quotationsBranchId))
        .map((q) => ({
          ...q,
          customer: customers.find((c) => c.id === q.customerId) ?? { name: 'Unknown' },
          salesRepresentative: q.salesRepresentativeId
            ? reps.find((r) => r.id === q.salesRepresentativeId) ?? null
            : null,
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (!seg2 && method === 'post') {
      const totals = computeTotals(body.lines);
      return genericCreate(
        'quotations',
        {
          ...body,
          salesRepresentativeId: resolveOfflineSalesRepId(body.salesRepresentativeId),
          // A non-admin can never attribute a quotation to a branch other than their own —
          // mirrors the rep override above.
          branchId: resolveOfflineBranchId(body.branchId),
          lines: (body.lines ?? []).map((l: any) => ({ id: genId(), ...l, lineTotal: computeLineTotal(l) })),
        },
        {
          companyId: quotationsCompanyId,
          documentNumber: nextDocNumber('quotations', 'QUO', quotationsCompanyId),
          status: 'DRAFT',
          ...totals,
          createdAt: new Date().toISOString(),
        },
      );
    }
    // Once a quotation is past DRAFT, only a true Administrator may still edit/delete it —
    // mirrors QuotationsService.assertMayModify() on the real backend.
    if (seg2 && !seg3 && method === 'patch') {
      const quotations = readTable<any>('quotations');
      const quotation = quotations.find((q) => q.id === seg2 && q.companyId === quotationsCompanyId);
      if (!quotation) throw new OfflineApiError('Quotation not found');
      const sessionUser = getOfflineSessionUser();
      if (quotation.status !== 'DRAFT' && !sessionUser?.isSystemRole) {
        throw new OfflineApiError('Only an administrator may edit or delete a quotation that is no longer a draft');
      }
      if (body.quotationDate !== undefined) quotation.quotationDate = body.quotationDate;
      if (body.validUntil !== undefined) quotation.validUntil = body.validUntil ?? null;
      if (body.customerId !== undefined) quotation.customerId = body.customerId;
      if (body.branchId !== undefined) quotation.branchId = resolveOfflineBranchId(body.branchId);
      if (body.salesRepresentativeId !== undefined) {
        quotation.salesRepresentativeId = resolveOfflineSalesRepId(body.salesRepresentativeId);
      }
      if (body.notes !== undefined) quotation.notes = body.notes ?? null;
      if (body.lines) {
        const totals = computeTotals(body.lines);
        Object.assign(quotation, totals);
        quotation.lines = body.lines.map((l: any) => ({ id: genId(), ...l, lineTotal: computeLineTotal(l) }));
      }
      writeTable('quotations', quotations);
      return quotation;
    }
    if (seg2 && !seg3 && method === 'delete') {
      const quotations = readTable<any>('quotations');
      const quotation = quotations.find((q) => q.id === seg2 && q.companyId === quotationsCompanyId);
      if (!quotation) throw new OfflineApiError('Quotation not found');
      const sessionUser = getOfflineSessionUser();
      if (quotation.status !== 'DRAFT' && !sessionUser?.isSystemRole) {
        throw new OfflineApiError('Only an administrator may edit or delete a quotation that is no longer a draft');
      }
      return genericDelete('quotations', seg2);
    }
    // Converts an accepted quotation directly into a Sales Invoice — recurses into the
    // /sales/invoices POST handler above rather than duplicating its stock/COGS/profit logic.
    if (seg2 && seg3 === 'convert-to-invoice' && method === 'post') {
      const quotations = readTable<any>('quotations');
      const quotation = quotations.find((q) => q.id === seg2 && q.companyId === quotationsCompanyId);
      if (!quotation) throw new OfflineApiError('Quotation not found');
      if (['INVOICED', 'PAID', 'PARTIALLY_PAID', 'CANCELLED'].includes(quotation.status)) {
        throw new OfflineApiError('This quotation has already been converted or is no longer active');
      }
      const companyWarehouses = readTable<any>('warehouses').filter((w) => w.companyId === quotationsCompanyId);
      const warehouse = companyWarehouses.find((w) => w.isDefault) ?? companyWarehouses[0];
      if (!warehouse) throw new OfflineApiError('No warehouse configured for this company');

      const invoice = resolveOfflineRequest(
        'post',
        '/sales/invoices',
        {},
        {
          invoiceDate: new Date().toISOString().slice(0, 10),
          customerId: quotation.customerId,
          warehouseId: warehouse.id,
          branchId: quotation.branchId ?? undefined,
          salesRepresentativeId: quotation.salesRepresentativeId ?? undefined,
          notes: quotation.notes ?? undefined,
          lines: (quotation.lines ?? []).map((l: any) => ({
            productId: l.productId,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unitPrice),
          })),
        },
      );

      quotation.status = 'INVOICED';
      writeTable('quotations', quotations);

      return invoice;
    }
  }

  // --- Sales: orders -------------------------------------------------------------
  if (seg0 === 'sales' && seg1 === 'orders') {
    if (method === 'get') {
      const customers = readTable<any>('customers');
      const warehouses = readTable<any>('warehouses');
      return genericList('salesOrders').map((o) => ({
        ...o,
        customer: customers.find((c) => c.id === o.customerId) ?? { name: 'Unknown' },
        warehouse: warehouses.find((w) => w.id === o.warehouseId) ?? { nameEn: 'Unknown' },
      }));
    }
    if (method === 'post') {
      const totals = computeTotals(body.lines);
      return genericCreate('salesOrders', body, {
        documentNumber: nextDocNumber('salesOrders', 'SO'),
        status: 'CONFIRMED',
        ...totals,
      });
    }
  }

  // --- Sales: invoices -------------------------------------------------------------
  if (seg0 === 'sales' && seg1 === 'invoices') {
    const invoicesCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg2 === 'report' && seg3 === 'lines' && method === 'get') {
      return buildSalesLinesReport(params?.companyId, params?.dateFrom, params?.dateTo, params?.branchId);
    }
    if (seg2 === 'assignable-users' && method === 'get') {
      // Mirrors the real backend's getAssignableUsers(): Administrators (isSystemRole) are
      // visible from every company context; everyone else only appears here where they hold a
      // userCompanies row for the active company — this is what previously let a user from an
      // unrelated company (e.g. التكييفات) leak into another company's assignee dropdown.
      const links = readTable<any>('userCompanies');
      return readTable<any>('users')
        .filter((u) => u.isActive)
        .filter((u) => {
          if (u.roles?.some((r: any) => r.isSystemRole)) return true;
          return links.some((l) => l.userId === u.id && l.companyId === invoicesCompanyId);
        })
        .map((u) => ({ id: u.id, fullName: u.fullName }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }
    if (seg2 && method === 'get') {
      const invoice = findOne<any>('salesInvoices', seg2);
      if (invoice.companyId !== invoicesCompanyId) throw new OfflineApiError('Not found');
      const customers = readTable<any>('customers');
      const products = readTable<any>('products');
      const units = readTable<any>('units');
      const packageTypes = readTable<any>('packageTypes');
      return {
        ...invoice,
        customer: customers.find((c) => c.id === invoice.customerId) ?? { id: invoice.customerId, name: 'Unknown' },
        lines: (invoice.lines ?? []).map((l: any) => {
          const p = products.find((pp) => pp.id === l.productId) ?? { sku: '', nameEn: 'Unknown' };
          return {
            ...l,
            product: {
              ...p,
              unit: p.unitId ? { nameEn: units.find((u) => u.id === p.unitId)?.nameEn ?? '' } : null,
              packageType: p.packageTypeId
                ? { nameEn: packageTypes.find((pt) => pt.id === p.packageTypeId)?.nameEn ?? '' }
                : null,
            },
          };
        }),
      };
    }
    if (!seg2 && method === 'get') {
      const customers = readTable<any>('customers');
      const users = readTable<any>('users');
      // Branch-scoped exactly like the Sales report's "الفرع" filter: a non-admin pinned to a
      // branch (via their own linked SalesRepresentative) only ever sees that branch's invoices.
      const invoicesBranchId = resolveOfflineBranchId(undefined);
      return genericList('salesInvoices')
        .filter((i: any) => i.companyId === invoicesCompanyId && (!invoicesBranchId || i.branchId === invoicesBranchId))
        .map((i) => ({
          ...i,
          customer: customers.find((c) => c.id === i.customerId) ?? { name: 'Unknown' },
          createdByName: users.find((u) => u.id === i.createdById)?.fullName ?? '—',
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (!seg2 && method === 'post') {
      const products = readTable<any>('products');
      const totals = computeTotals(body.lines);
      const documentNumber = nextDocNumber('salesInvoices', 'INV', invoicesCompanyId);
      let costOfGoodsSold = 0;
      let totalProfit = 0;
      const lines = body.lines.map((l: LineInput & { unitKind?: 'UNIT' | 'PACKAGE' }) => {
        const product = products.find((p: any) => p.id === l.productId);
        const unitKind = l.unitKind ?? 'UNIT';
        const unitsPerPackage = product?.unitsPerPackage ? Number(product.unitsPerPackage) : null;
        if (unitKind === 'PACKAGE' && !unitsPerPackage) {
          throw new OfflineApiError(
            `"${product?.nameEn ?? l.productId}" has no package size configured — cannot sell by package.`,
          );
        }
        const baseQuantity = unitKind === 'PACKAGE' ? Number(l.quantity) * unitsPerPackage! : Number(l.quantity);

        // Catalog items (Printing Press "المنتجات") are finished/manufactured products with no
        // real stock tracking — only raw materials (default RAW_MATERIAL, whether flagged
        // "قابلة للبيع" or not) ever move real warehouse stock. Mirrors sales-invoices.service.ts.
        const unitCost =
          product?.productType === 'CATALOG_ITEM'
            ? 0
            : issueStock(l.productId, body.warehouseId, baseQuantity, 'SALES_INVOICE', documentNumber);
        costOfGoodsSold += unitCost * baseQuantity;

        const purchasePrice =
          unitKind === 'PACKAGE'
            ? Number(product?.packagePurchasePrice ?? Number(product?.purchasePrice ?? 0) * (unitsPerPackage ?? 1))
            : Number(product?.purchasePrice ?? 0);
        const suggestedPrice =
          unitKind === 'PACKAGE'
            ? Number(product?.packageSellingPrice ?? Number(product?.sellingPrice ?? 0) * (unitsPerPackage ?? 1))
            : Number(product?.sellingPrice ?? 0);
        const profitPerUnit = Number(l.unitPrice) - purchasePrice;
        const lineTotalProfit = profitPerUnit * Number(l.quantity);
        totalProfit += lineTotalProfit;
        return {
          id: genId(),
          productId: l.productId,
          unitKind,
          quantity: l.quantity,
          baseQuantity,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent ?? 0,
          taxPercent: l.taxPercent ?? 0,
          lineTotal: computeLineTotal(l),
          unitCost,
          purchasePrice,
          suggestedPrice,
          profitPerUnit,
          totalProfit: lineTotalProfit,
        };
      });
      // A credit sale never touches the treasury — only the customer's balance (grandTotal minus
      // amountPaid) changes. An upfront payment records an actual CashMovement below, exactly like
      // a payment made later via SalesPaymentsService.
      const paidAmount = Number(body.paidAmount ?? 0);
      const status = paidAmount <= 0 ? 'CONFIRMED' : paidAmount >= totals.grandTotal ? 'PAID' : 'PARTIALLY_PAID';
      const owner = resolveOfflineInvoiceOwner({
        salesRepresentativeId: body.salesRepresentativeId,
        createdById: body.createdById,
      });
      // A non-admin can never attribute an invoice to a branch other than their own — mirrors
      // the rep/owner override above.
      const branchId = resolveOfflineBranchId(body.branchId);

      const invoiceId = genId();
      const invoices = readTable<any>('salesInvoices');
      invoices.push({
        id: invoiceId,
        isActive: true,
        ...body,
        companyId: invoicesCompanyId,
        documentNumber,
        status,
        amountPaid: paidAmount,
        costOfGoodsSold,
        totalProfit,
        lines,
        ...totals,
        branchId,
        salesRepresentativeId: owner.salesRepresentativeId,
        createdById: owner.createdById,
        createdAt: new Date().toISOString(),
      });
      writeTable('salesInvoices', invoices);

      // An upfront payment at invoice creation is just the payment flow composed atomically with
      // invoice creation: it records an actual CashMovement and a SalesPayment row — any amount
      // beyond the invoice total still leaves the customer's balance in credit, since it's always
      // grandTotal minus amountPaid.
      if (paidAmount > 0) {
        const paymentDocumentNumber = nextDocNumber('salesPayments', 'RCV', invoicesCompanyId);
        const movement = recordCashMovement({
          companyId: invoicesCompanyId,
          branchId,
          movementDate: body.invoiceDate,
          type: 'INCOME',
          account: body.paymentAccount ?? 'CASH',
          amount: paidAmount,
          sourceType: 'SALES_INVOICE',
          sourceId: invoiceId,
          partyCustomerId: body.customerId,
          description: `Payment ${paymentDocumentNumber}`,
        });
        genericCreate('salesPayments', {
          paymentDate: body.invoiceDate,
          customerId: body.customerId,
          companyId: invoicesCompanyId,
          invoiceId,
          method: 'CASH',
          amount: paidAmount,
          cashMovementId: movement.id,
          createdById: getOfflineSessionUser()?.id,
        }, { documentNumber: paymentDocumentNumber, createdAt: new Date().toISOString() });
      }

      return invoices.find((i) => i.id === invoiceId);
    }
    if (seg2 && method === 'patch') {
      const invoices = readTable<any>('salesInvoices');
      const invoice = invoices.find((i) => i.id === seg2);
      if (!invoice || invoice.companyId !== invoicesCompanyId) throw new OfflineApiError('Not found');
      // Deliberately scoped to fields with no stock/COGS/payment impact — see the backend's
      // UpdateSalesInvoiceDto for why the warehouse and line items are never editable here.
      const owner = resolveOfflineInvoiceOwner({
        salesRepresentativeId: body.salesRepresentativeId,
        createdById: body.createdById,
      });
      invoice.invoiceDate = body.invoiceDate;
      invoice.customerId = body.customerId;
      invoice.salesRepresentativeId = owner.salesRepresentativeId;
      invoice.createdById = owner.createdById;
      invoice.notes = body.notes ?? null;
      invoice.customerName = body.customerName ?? null;
      invoice.customerPhone = body.customerPhone ?? null;
      writeTable('salesInvoices', invoices);
      return invoice;
    }
    if (seg2 && method === 'delete') {
      const invoices = readTable<any>('salesInvoices');
      const invoice = invoices.find((i) => i.id === seg2);
      if (!invoice || invoice.companyId !== invoicesCompanyId) throw new OfflineApiError('Not found');

      // Reverse every line's stock, received back at the exact cost it was issued at — mirrors
      // create()'s skip: catalog items never had stock issued in the first place (see the POST
      // handler above), so there is nothing to receive back for them.
      const productsForReversal = readTable<any>('products');
      for (const line of invoice.lines ?? []) {
        const product = productsForReversal.find((p) => p.id === line.productId);
        if (product?.productType === 'CATALOG_ITEM') continue;
        receiveStock(
          line.productId,
          invoice.warehouseId,
          Number(line.baseQuantity),
          Number(line.unitCost),
          'SALES_INVOICE_DELETE',
          invoice.documentNumber,
        );
      }

      // Reverse any payment(s) recorded against this invoice and their linked cash movements.
      const payments = readTable<any>('salesPayments');
      const invoicePayments = payments.filter((p) => p.invoiceId === seg2);
      if (invoicePayments.length) {
        const movements = readTable<any>('cashMovements');
        const movementIdsToRemove = new Set(invoicePayments.map((p) => p.cashMovementId).filter(Boolean));
        writeTable(
          'cashMovements',
          movements.filter((m) => !movementIdsToRemove.has(m.id)),
        );
        writeTable(
          'salesPayments',
          payments.filter((p) => p.invoiceId !== seg2),
        );
      }

      writeTable(
        'salesInvoices',
        invoices.filter((i) => i.id !== seg2),
      );
      return { deleted: true };
    }
  }

  // --- Sales: payments -------------------------------------------------------------
  if (seg0 === 'sales' && seg1 === 'payments') {
    const paymentsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      const customers = readTable<any>('customers');
      const invoices = readTable<any>('salesInvoices');
      const reps = readTable<any>('salesRepresentatives');
      const users = readTable<any>('users');
      return genericList('salesPayments')
        .filter((p: any) => p.companyId === paymentsCompanyId)
        .filter((p) => !params?.customerId || p.customerId === params.customerId)
        .map((p) => ({
          ...p,
          customer: customers.find((c) => c.id === p.customerId) ?? { name: 'Unknown' },
          invoice: p.invoiceId ? invoices.find((i) => i.id === p.invoiceId) : undefined,
          salesRepresentative: p.salesRepresentativeId
            ? reps.find((r) => r.id === p.salesRepresentativeId) ?? null
            : null,
          // Who was actually logged in when this receipt was recorded — always set (unlike the
          // optional salesRepresentative link), so this is the reliable "responsible person" signal.
          createdByName: users.find((u) => u.id === p.createdById)?.fullName ?? '—',
        }))
        .sort((a: any, b: any) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    if (!seg2 && method === 'post') {
      const documentNumber = nextDocNumber('salesPayments', 'RCV', paymentsCompanyId);
      if (body.invoiceId) {
        const invoices = readTable<any>('salesInvoices');
        const invoice = invoices.find((i) => i.id === body.invoiceId);
        if (invoice) {
          invoice.amountPaid = (invoice.amountPaid ?? 0) + Number(body.amount);
          invoice.status = invoice.amountPaid >= invoice.grandTotal ? 'PAID' : 'PARTIALLY_PAID';
          writeTable('salesInvoices', invoices);
        }
      }
      // Printing Press explicitly picks the treasury account (body.paymentAccount). Every other
      // company only records `method` (cash/bank transfer/cheque/card/online) — mirrors
      // SalesPaymentsService.create(): CASH stays CASH, anything else settles into BANK, instead
      // of defaulting every receipt to CASH regardless of the method actually recorded.
      const resolvedAccount =
        body.paymentAccount ?? (body.method && body.method !== 'CASH' ? 'BANK' : 'CASH');
      const movement = recordCashMovement({
        companyId: paymentsCompanyId,
        branchId: body.branchId,
        movementDate: body.paymentDate,
        type: 'INCOME',
        account: resolvedAccount,
        amount: Number(body.amount),
        sourceType: 'SALES_PAYMENT',
        partyCustomerId: body.customerId,
        description: `Payment ${documentNumber}`,
      });
      return genericCreate(
        'salesPayments',
        {
          ...body,
          // Printing Press's simplified receipt form omits both — mirrors the backend defaulting
          // customerId to null and method to CASH (see SalesPaymentsService.create()).
          customerId: body.customerId ?? null,
          method: body.method ?? 'CASH',
          paymentAccount: resolvedAccount,
          salesRepresentativeId: resolveOfflineSalesRepId(body.salesRepresentativeId),
        },
        {
          companyId: paymentsCompanyId,
          documentNumber,
          cashMovementId: movement.id,
          createdById: getOfflineSessionUser()?.id,
          createdAt: new Date().toISOString(),
        },
      );
    }
    // Reverses a payment's old effect on whichever invoice/cash-movement it touched, then
    // re-applies the edited amount — mirrors SalesPaymentsService.update()'s
    // reverse-then-reapply approach exactly.
    if (seg2 && method === 'patch') {
      const payments = readTable<any>('salesPayments');
      const existing = payments.find((p) => p.id === seg2 && p.companyId === paymentsCompanyId);
      if (!existing) throw new OfflineApiError('Sales payment not found');

      if (existing.invoiceId) {
        const invoices = readTable<any>('salesInvoices');
        const invoice = invoices.find((i) => i.id === existing.invoiceId);
        if (invoice) {
          invoice.amountPaid = Math.max(0, Number(invoice.amountPaid ?? 0) - Number(existing.amount));
          invoice.status =
            invoice.amountPaid <= 0
              ? 'CONFIRMED'
              : invoice.amountPaid >= invoice.grandTotal
                ? 'PAID'
                : 'PARTIALLY_PAID';
          writeTable('salesInvoices', invoices);
        }
      }

      if (existing.cashMovementId) {
        const movements = readTable<any>('cashMovements');
        writeTable(
          'cashMovements',
          movements.filter((m) => m.id !== existing.cashMovementId),
        );
      }

      const resolvedAccount =
        body.paymentAccount ?? (body.method && body.method !== 'CASH' ? 'BANK' : 'CASH');
      const movement = recordCashMovement({
        companyId: paymentsCompanyId,
        branchId: body.branchId,
        movementDate: body.paymentDate,
        type: 'INCOME',
        account: resolvedAccount,
        amount: Number(body.amount),
        sourceType: 'SALES_PAYMENT',
        partyCustomerId: body.customerId,
        description: `Payment ${existing.documentNumber}`,
      });

      Object.assign(existing, {
        ...body,
        customerId: body.customerId ?? null,
        method: body.method ?? 'CASH',
        paymentAccount: resolvedAccount,
        salesRepresentativeId: resolveOfflineSalesRepId(body.salesRepresentativeId),
        cashMovementId: movement.id,
      });
      writeTable('salesPayments', payments);

      if (body.invoiceId) {
        const invoices = readTable<any>('salesInvoices');
        const invoice = invoices.find((i) => i.id === body.invoiceId);
        if (invoice) {
          invoice.amountPaid = Number(invoice.amountPaid ?? 0) + Number(body.amount);
          invoice.status = invoice.amountPaid >= invoice.grandTotal ? 'PAID' : 'PARTIALLY_PAID';
          writeTable('salesInvoices', invoices);
        }
      }

      return existing;
    }
    if (seg2 && method === 'delete') {
      const payments = readTable<any>('salesPayments');
      const existing = payments.find((p) => p.id === seg2 && p.companyId === paymentsCompanyId);
      if (!existing) throw new OfflineApiError('Sales payment not found');

      if (existing.invoiceId) {
        const invoices = readTable<any>('salesInvoices');
        const invoice = invoices.find((i) => i.id === existing.invoiceId);
        if (invoice) {
          invoice.amountPaid = Math.max(0, Number(invoice.amountPaid ?? 0) - Number(existing.amount));
          invoice.status =
            invoice.amountPaid <= 0
              ? 'CONFIRMED'
              : invoice.amountPaid >= invoice.grandTotal
                ? 'PAID'
                : 'PARTIALLY_PAID';
          writeTable('salesInvoices', invoices);
        }
      }

      if (existing.cashMovementId) {
        const movements = readTable<any>('cashMovements');
        writeTable(
          'cashMovements',
          movements.filter((m) => m.id !== existing.cashMovementId),
        );
      }

      writeTable(
        'salesPayments',
        payments.filter((p) => p.id !== seg2),
      );
      return { success: true };
    }
  }

  // --- Treasury: internal transfer between Cash and Bank (Printing Press / Air Conditioning
  // only — see TreasuryTransactionsPage.tsx's showAccountSplit) --------------------
  if (seg0 === 'treasury' && seg1 === 'cash-movements' && seg2 === 'transfer' && method === 'post') {
    if (body.fromAccount === body.toAccount) {
      throw new OfflineApiError('Source and destination accounts must be different');
    }
    const transferCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    const from = recordCashMovement({
      companyId: transferCompanyId,
      branchId: body.branchId ?? null,
      movementDate: body.movementDate,
      type: 'EXPENSE',
      account: body.fromAccount,
      amount: Number(body.amount),
      sourceType: 'TRANSFER',
      description: body.description ?? null,
    });
    const to = recordCashMovement({
      companyId: transferCompanyId,
      branchId: body.branchId ?? null,
      movementDate: body.movementDate,
      type: 'INCOME',
      account: body.toAccount,
      amount: Number(body.amount),
      sourceType: 'TRANSFER',
      sourceId: from.id,
      description: body.description ?? null,
    });
    return { from, to };
  }

  // --- Treasury: manual cash movements + expense/profit reports ------------------
  if (seg0 === 'treasury' && seg1 === 'cash-movements' && !seg2 && method === 'post') {
    const cashMovementCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (body.type === 'EXPENSE') {
      assertSufficientBalance(cashMovementCompanyId, body.account, Number(body.amount), body.branchId ?? undefined);
    }
    return recordCashMovement({
      companyId: cashMovementCompanyId,
      movementDate: body.movementDate,
      type: body.type,
      account: body.account,
      amount: Number(body.amount),
      sourceType: 'MANUAL',
      category: body.category,
      branchId: body.branchId ?? null,
      description: body.description ?? null,
    });
  }
  if (seg0 === 'treasury' && seg1 === 'reports') {
    const reportsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg2 === 'expenses') return buildExpenseReport(reportsCompanyId, params?.dateFrom, params?.dateTo, params?.branchId);
    if (seg2 === 'profit') return buildProfitReport(reportsCompanyId, params?.dateFrom, params?.dateTo, params?.branchId);
    if (seg2 === 'cogs-transactions') return buildCogsTransactions(reportsCompanyId, params?.dateFrom, params?.dateTo);
    if (seg2 === 'printing-performance-trend')
      return buildPrintingPerformanceTrend(reportsCompanyId, Number(params?.year), Number(params?.quarter), params?.branchId);
  }
  if (seg0 === 'treasury' && seg1 === 'expenses' && method === 'get') {
    const treasuryExpensesCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    return buildExpenseTransactions(treasuryExpensesCompanyId, 'MANUAL', params?.dateFrom, params?.dateTo);
  }
  if (seg0 === 'treasury' && seg1 === 'salaries' && method === 'get') {
    const treasurySalariesCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    return buildExpenseTransactions(treasurySalariesCompanyId, 'PAYROLL', params?.dateFrom, params?.dateTo);
  }
  if (seg0 === 'treasury' && seg1 === 'manager-partner-profits' && method === 'get') {
    const profitsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    return buildManagerPartnerProfitTransactions(profitsCompanyId, params?.dateFrom, params?.dateTo);
  }
  if (seg0 === 'treasury' && seg1 === 'expenses' && seg2 && method === 'patch') {
    const treasuryExpensesCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    const rows = readTable<any>('cashMovements');
    const row = rows.find(
      (m) => m.id === seg2 && m.type === 'EXPENSE' && m.sourceType === 'MANUAL' && m.companyId === treasuryExpensesCompanyId,
    );
    if (!row) throw new OfflineApiError('Not found');
    // The row being replaced hasn't been mutated/written yet, so its own old amount is still
    // counted in the balance checked below — add it back only if it was drawn from the same
    // account the edit keeps it on.
    const excludeAmount = row.account === body.account ? Number(row.amount) : 0;
    assertSufficientBalance(
      treasuryExpensesCompanyId,
      body.account,
      Number(body.amount),
      body.branchId ?? row.branchId ?? undefined,
      excludeAmount,
    );
    row.movementDate = body.movementDate;
    row.account = body.account;
    row.amount = Number(body.amount);
    row.category = body.category;
    row.branchId = body.branchId ?? null;
    row.description = body.description ?? null;
    writeTable('cashMovements', rows);
    return row;
  }
  if (seg0 === 'treasury' && seg1 === 'expenses' && seg2 && method === 'delete') {
    const treasuryExpensesCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    const rows = readTable<any>('cashMovements');
    const exists = rows.some(
      (m) => m.id === seg2 && m.type === 'EXPENSE' && m.sourceType === 'MANUAL' && m.companyId === treasuryExpensesCompanyId,
    );
    if (!exists) throw new OfflineApiError('Not found');
    writeTable('cashMovements', rows.filter((m) => m.id !== seg2));
    return { deleted: true };
  }

  // --- Treasury: recurring expenses --------------------------------------------------
  if (seg0 === 'treasury' && seg1 === 'recurring-expenses') {
    const recurringCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      return genericList('recurringExpenses').filter((r: any) => r.companyId === recurringCompanyId);
    }
    if (!seg2 && method === 'post') {
      // The month this template is created in was already recorded manually (the immediate
      // expense the "add expense" form posts alongside this) — the generator only ever produces
      // FUTURE occurrences, so it must treat the creation month as already covered.
      return genericCreate('recurringExpenses', body, {
        companyId: recurringCompanyId,
        isActive: true,
        lastGeneratedPeriod: periodOf(new Date()),
        createdById: getOfflineSessionUser()?.id ?? 'offline-demo-user',
      });
    }
    if (seg2 && method === 'patch') {
      const rows = readTable<any>('recurringExpenses');
      const row = rows.find((r) => r.id === seg2 && r.companyId === recurringCompanyId);
      if (!row) throw new OfflineApiError('Not found');
      Object.assign(row, body, { companyId: recurringCompanyId });
      writeTable('recurringExpenses', rows);
      return row;
    }
  }

  // --- Treasury: partners' capital injections --------------------------------------
  if (seg0 === 'treasury' && seg1 === 'capital-injections') {
    const injectionsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (!seg2 && method === 'get') {
      const users = readTable<any>('users');
      const partners = readTable<any>('partners');
      return readTable<any>('cashMovements')
        // The linked CASH row created alongside the contributing partner's BANK row (see the POST
        // handler below) has no partnerId — exclude it so history shows one line per contribution,
        // not a duplicate.
        .filter(
          (m) =>
            m.companyId === injectionsCompanyId &&
            m.sourceType === 'CAPITAL_INJECTION' &&
            m.partnerId &&
            (!params?.partnerId || m.partnerId === params.partnerId),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((m) => ({
          id: m.id,
          date: m.movementDate,
          documentNumber: m.documentNumber,
          amount: Number(m.amount),
          account: m.account,
          branchId: m.branchId ?? null,
          description: m.description,
          partnerId: m.partnerId ?? null,
          partnerName: partners.find((p) => p.id === m.partnerId)?.name ?? '—',
          createdByName: users.find((u) => u.id === m.createdById)?.fullName ?? '—',
        }));
    }
    if (!seg2 && method === 'post') {
      const partners = readTable<any>('partners');
      const partner = partners.find((p) => p.id === body.partnerId && p.isActive && p.companyId === injectionsCompanyId);
      if (!partner) throw new OfflineApiError('Selected partner was not found or is not active');
      const amount = Number(body.amount);

      // Printing Press: the user explicitly picks which real account the money actually lands in
      // (CASH or BANK) — a single row covers both the treasury liquidity effect and the partner's
      // equity attribution, no linked memo row needed.
      const isPress = OFFLINE_COMPANY_DEFS.find((c) => c.code === 'PRESS')?.id === injectionsCompanyId;
      if (isPress && body.account) {
        // The partner's own branchId (when set) is authoritative — mirrors the backend's
        // createCapitalInjection: a branch-bound partner's contribution can only ever be
        // attributed to their own branch.
        return recordCashMovement({
          companyId: injectionsCompanyId,
          branchId: partner.branchId ?? body.branchId ?? null,
          movementDate: body.movementDate,
          type: 'INCOME',
          account: body.account,
          amount,
          sourceType: 'CAPITAL_INJECTION',
          category: 'Capital Injection',
          partnerId: body.partnerId,
          description: body.description ?? null,
        });
      }

      // A contribution is one partner's own money, credited in full to their own equity row — never
      // split across the others by ownership share (that's what a dividend payout does, the
      // opposite direction). It lands in TWO rows: that one partner's Partners' Balance (BANK) row
      // for equity tracking, and a matching Bank Balance (CASH) row of the same amount so the
      // actual treasury liquidity rises too — linked via sourceId so editing/deleting the visible
      // contribution (the BANK row) keeps both in sync.
      const cashMovement = recordCashMovement({
        companyId: injectionsCompanyId,
        movementDate: body.movementDate,
        type: 'INCOME',
        account: 'CASH',
        amount,
        sourceType: 'CAPITAL_INJECTION',
        category: 'Capital Injection',
        description: body.description ?? null,
      });
      return recordCashMovement({
        companyId: injectionsCompanyId,
        movementDate: body.movementDate,
        type: 'INCOME',
        account: 'BANK',
        amount,
        sourceType: 'CAPITAL_INJECTION',
        sourceId: cashMovement.id,
        category: 'Capital Injection',
        partnerId: body.partnerId,
        description: body.description ?? null,
      });
    }
    if (seg2 && method === 'patch') {
      const rows = readTable<any>('cashMovements');
      const row = rows.find((m) => m.id === seg2 && m.sourceType === 'CAPITAL_INJECTION' && m.type === 'INCOME');
      if (!row) throw new OfflineApiError('Not found');
      row.movementDate = body.movementDate;
      row.amount = Number(body.amount);
      row.description = body.description ?? null;
      if (body.partnerId) row.partnerId = body.partnerId;
      if (!row.sourceId && body.account) row.account = body.account;
      if (!row.sourceId && body.branchId !== undefined) row.branchId = body.branchId;
      if (row.sourceId) {
        const linkedCash = rows.find((m) => m.id === row.sourceId);
        if (linkedCash) {
          linkedCash.movementDate = body.movementDate;
          linkedCash.amount = Number(body.amount);
          linkedCash.description = body.description ?? null;
        }
      }
      writeTable('cashMovements', rows);
      return row;
    }
    if (seg2 && method === 'delete') {
      const rows = readTable<any>('cashMovements');
      const row = rows.find((m) => m.id === seg2 && m.sourceType === 'CAPITAL_INJECTION' && m.type === 'INCOME');
      if (!row) throw new OfflineApiError('Not found');
      const idsToRemove = new Set([row.id, row.sourceId].filter(Boolean));
      writeTable(
        'cashMovements',
        rows.filter((m) => !idsToRemove.has(m.id)),
      );
      return { deleted: true };
    }
  }

  // --- Treasury: per-partner balances --------------------------------------------
  // Each partner's balance is the sum of THEIR OWN capital injections only — never dividends: a
  // payout received is not a contribution paid in, so it must never reduce (or inflate) this
  // number. `total` is derived by summing these same per-partner balances, so the top "Total
  // Contribution Balance" card and this table can never disagree with each other or with the
  // Contribution History log above, which reads the exact same filtered rows.
  if (seg0 === 'treasury' && seg1 === 'partners-balances' && method === 'get') {
    const partnersBalancesCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    // Printing Press only — a partner's own branchId now scopes which cap table they belong to,
    // so narrowing by branch here also narrows WHICH partners show up at all, not just their
    // movement totals — mirrors the backend's getPartnersBalances.
    const partners = readTable<any>('partners').filter(
      (p) =>
        p.isActive &&
        p.companyId === partnersBalancesCompanyId &&
        (!params?.branchId || p.branchId === params.branchId),
    );
    const movements = readTable<any>('cashMovements').filter(
      (m) =>
        m.companyId === partnersBalancesCompanyId &&
        m.partnerId &&
        m.sourceType === 'CAPITAL_INJECTION' &&
        (!params?.branchId || m.branchId === params.branchId),
    );
    const balances = partners.map((p) => ({
      partnerId: p.id,
      name: p.name,
      sharePercentage: Number(p.sharePercentage),
      branchId: p.branchId ?? null,
      balance: movements.filter((m) => m.partnerId === p.id).reduce((sum, m) => sum + Number(m.amount), 0),
    }));
    return { balances, total: balances.reduce((sum, b) => sum + b.balance, 0) };
  }

  // --- Treasury: dividends -----------------------------------------------------------
  if (seg0 === 'treasury' && seg1 === 'dividends') {
    const dividendsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg2 === 'available' && method === 'get') {
      const { dateFrom, dateTo } = quarterDateRange(Number(params?.year), Number(params?.quarter));
      const { netProfit } = buildProfitReport(dividendsCompanyId, dateFrom, dateTo);
      const alreadyDistributed = buildDistributedDividendsTotal(dividendsCompanyId, dateFrom, dateTo);
      const available = netProfit <= 0 ? 0 : Math.max(netProfit - alreadyDistributed, 0);
      return { dateFrom, dateTo, netProfit, alreadyDistributed, available };
    }
    // How much MORE a specific partner can still be paid out this quarter — their share of the
    // quarter's available profit, minus whatever's already been paid to them (not the others)
    // within the same period. Backs the dividend modal's read-only max-allowed field.
    if (seg2 === 'partner-max' && method === 'get') {
      const partner = readTable<any>('partners').find(
        (p) => p.id === params?.partnerId && p.isActive && p.companyId === dividendsCompanyId,
      );
      if (!partner) throw new OfflineApiError('Selected partner was not found or is not active');
      // Printing Press only — a branch-owned partner's available pool and distributed history are
      // scoped to their own branch's profit and payouts, never mixed with another branch's.
      const branchId = partner.branchId ?? undefined;
      const { dateFrom, dateTo } = quarterDateRange(Number(params?.year), Number(params?.quarter));
      const { netProfit } = buildProfitReport(dividendsCompanyId, dateFrom, dateTo, branchId);
      const totalAlreadyDistributed = buildDistributedDividendsTotal(dividendsCompanyId, dateFrom, dateTo, undefined, branchId);
      const available = netProfit <= 0 ? 0 : Math.max(netProfit - totalAlreadyDistributed, 0);
      const alreadyPaidToPartner = buildDistributedDividendsTotal(dividendsCompanyId, dateFrom, dateTo, partner.id, branchId);
      const sharePercentage = Number(partner.sharePercentage);
      const maxAmount = Math.max((sharePercentage / 100) * available - alreadyPaidToPartner, 0);
      return { sharePercentage, available, alreadyPaidToPartner, maxAmount };
    }
    if (!seg2 && method === 'get') {
      const users = readTable<any>('users');
      const partners = readTable<any>('partners');
      return readTable<any>('cashMovements')
        .filter(
          (m) =>
            m.companyId === dividendsCompanyId &&
            m.sourceType === 'DIVIDEND' &&
            (!params?.dateFrom || m.movementDate >= params.dateFrom) &&
            (!params?.dateTo || m.movementDate <= params.dateTo) &&
            (!params?.partnerId || m.partnerId === params.partnerId),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((m) => ({
          id: m.id,
          date: m.movementDate,
          documentNumber: m.documentNumber,
          amount: Number(m.amount),
          branchId: m.branchId ?? null,
          description: m.description,
          partnerId: m.partnerId ?? null,
          partnerName: partners.find((p) => p.id === m.partnerId)?.name ?? '—',
          createdByName: users.find((u) => u.id === m.createdById)?.fullName ?? '—',
        }));
    }
    if (!seg2 && method === 'post') {
      const partner = readTable<any>('partners').find(
        (p) => p.id === body.partnerId && p.isActive && p.companyId === dividendsCompanyId,
      );
      if (!partner) throw new OfflineApiError('Selected partner was not found or is not active');

      // Printing Press only — see partner-max's comment above.
      const branchId = partner.branchId ?? undefined;
      const { dateFrom, dateTo } = quarterDateRange(Number(body.year), Number(body.quarter));
      const { netProfit } = buildProfitReport(dividendsCompanyId, dateFrom, dateTo, branchId);
      const totalAlreadyDistributed = buildDistributedDividendsTotal(dividendsCompanyId, dateFrom, dateTo, undefined, branchId);
      const available = netProfit <= 0 ? 0 : Math.max(netProfit - totalAlreadyDistributed, 0);
      const alreadyPaidToPartner = buildDistributedDividendsTotal(dividendsCompanyId, dateFrom, dateTo, partner.id, branchId);
      const maxAmount = Math.max((Number(partner.sharePercentage) / 100) * available - alreadyPaidToPartner, 0);
      const amount = Number(body.amount);
      if (amount > maxAmount) {
        throw new OfflineApiError(
          `Cannot distribute ${amount.toFixed(2)} to ${partner.name} — only ${maxAmount.toFixed(2)} of their share remains available this period (share ${Number(partner.sharePercentage).toFixed(2)}%, already paid ${alreadyPaidToPartner.toFixed(2)}).`,
        );
      }

      // A dividend is real cash actually paid out to ONE partner, so it draws down the Bank
      // Balance (CASH) — not the Partners' Balance (BANK) memo account capital injections track
      // into. Never split across the other partners: each of them draws down their own share
      // independently, whenever they choose to. The partner's own branchId (when set) is
      // authoritative over whatever branch the client sent.
      return recordCashMovement({
        companyId: dividendsCompanyId,
        branchId: partner.branchId ?? body.branchId ?? null,
        movementDate: body.movementDate,
        type: 'EXPENSE',
        account: 'CASH',
        amount,
        sourceType: 'DIVIDEND',
        category: 'Dividends',
        partnerId: body.partnerId,
        description: body.description ?? null,
      });
    }
  }

  // --- Treasury: commission payouts ("صرف الأرباح") ---------------------------------
  // Mirrors PartnersTreasuryController's commission-payouts routes / CashMovementsService's
  // createCommissionPayout/updateCommissionPayout/deleteCommissionPayout/getCommissionPayouts —
  // a branch manager's earned commission paid out of a user-chosen account (unlike dividends,
  // which always draw from CASH), attributed via salesRepresentativeId the way partnerId
  // attributes a dividend.
  if (seg0 === 'treasury' && seg1 === 'commission-payouts') {
    const payoutsCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;

    if (!seg2 && method === 'get') {
      const users = readTable<any>('users');
      return readTable<any>('cashMovements')
        .filter(
          (m) =>
            m.companyId === payoutsCompanyId &&
            m.sourceType === 'COMMISSION_PAYOUT' &&
            (!params?.dateFrom || m.movementDate >= params.dateFrom) &&
            (!params?.dateTo || m.movementDate <= params.dateTo) &&
            (!params?.salesRepresentativeId || m.salesRepresentativeId === params.salesRepresentativeId),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map((m) => ({
          id: m.id,
          date: m.movementDate,
          documentNumber: m.documentNumber,
          amount: Number(m.amount),
          account: m.account,
          branchId: m.branchId ?? null,
          salesRepresentativeId: m.salesRepresentativeId ?? null,
          description: m.description,
          createdAt: m.createdAt,
          createdByName: users.find((u) => u.id === m.createdById)?.fullName ?? '—',
        }));
    }

    if (!seg2 && method === 'post') {
      const rep = readTable<any>('salesRepresentatives').find(
        (r) => r.id === body.salesRepresentativeId && r.isActive && r.companyId === payoutsCompanyId,
      );
      if (!rep) throw new OfflineApiError('Selected branch manager was not found or is not active');
      const amount = Number(body.amount);
      const branchId = body.branchId ?? rep.branchId ?? null;
      assertSufficientBalance(payoutsCompanyId, body.account, amount, branchId);
      return recordCashMovement({
        companyId: payoutsCompanyId,
        branchId,
        movementDate: body.movementDate,
        type: 'EXPENSE',
        account: body.account,
        amount,
        sourceType: 'COMMISSION_PAYOUT',
        category: 'Commission Payout',
        salesRepresentativeId: body.salesRepresentativeId,
        description: body.description ?? null,
      });
    }

    if (seg2 && method === 'patch') {
      const rows = readTable<any>('cashMovements');
      const row = rows.find((m) => m.id === seg2 && m.companyId === payoutsCompanyId && m.sourceType === 'COMMISSION_PAYOUT');
      if (!row) throw new OfflineApiError('Commission payout not found');
      const amount = Number(body.amount);
      // Same-account edits add the row's own old amount back before comparing, so replacing a
      // payout in place never falsely counts itself as an extra draw on the balance.
      const excludeAmount = row.account === body.account ? Number(row.amount) : 0;
      assertSufficientBalance(payoutsCompanyId, body.account, amount, row.branchId, excludeAmount);
      row.movementDate = body.movementDate;
      row.amount = amount;
      row.account = body.account;
      row.description = body.description ?? null;
      writeTable('cashMovements', rows);
      return row;
    }

    if (seg2 && method === 'delete') {
      const rows = readTable<any>('cashMovements');
      const row = rows.find((m) => m.id === seg2 && m.companyId === payoutsCompanyId && m.sourceType === 'COMMISSION_PAYOUT');
      if (!row) throw new OfflineApiError('Commission payout not found');
      writeTable(
        'cashMovements',
        rows.filter((m) => m.id !== seg2),
      );
      return { deleted: true };
    }
  }

  // --- Users / roles ---------------------------------------------------------------
  if (seg0 === 'users') {
    // Self-service "Account Settings" — declared before the generic list/':id' handlers below so
    // 'me' is never swallowed by the plain "GET /users" list handler or mistaken for a user id.
    // Every logged-in user (any role) may view/edit their own phone/email this way; mirrors
    // UsersService.getOwnProfile()/updateOwnProfile() — never touches
    // roles/isActive/companyId/companyIds, and (unlike the generic PATCH branch further below)
    // does NOT apply the "primary admin is protected" block, since that block exists to stop an
    // admin editing *someone else's* protected account, not their own.
    if (seg1 === 'me' && !seg2 && method === 'get') {
      const sessionUser = getOfflineSessionUser();
      if (!sessionUser) throw new OfflineApiError('Not logged in');
      const row = readTable<any>('users').find((r) => r.id === sessionUser.id);
      if (!row) throw new OfflineApiError('Not found');
      return row;
    }
    if (seg1 === 'me' && !seg2 && method === 'patch') {
      const sessionUser = getOfflineSessionUser();
      if (!sessionUser) throw new OfflineApiError('Not logged in');
      const rows = readTable<any>('users');
      const row = rows.find((r) => r.id === sessionUser.id);
      if (!row) throw new OfflineApiError('Not found');
      if (typeof body.email === 'string' && body.email.toLowerCase() !== row.email?.toLowerCase()) {
        const existing = rows.find((r) => r.id !== row.id && r.email?.toLowerCase() === body.email.toLowerCase());
        if (existing) throw new OfflineApiError('Email already in use');
        row.email = body.email.toLowerCase();
      }
      const trimmedOwnPhone = typeof body.phone === 'string' ? body.phone.trim() : body.phone;
      if (trimmedOwnPhone !== undefined && trimmedOwnPhone !== row.phone) {
        const existing = rows.find((r) => r.id !== row.id && r.phone === trimmedOwnPhone);
        if (existing) throw new OfflineApiError('Phone number already in use');
        row.phone = trimmedOwnPhone;
      }
      writeTable('users', rows);
      return row;
    }

    if (method === 'get') {
      const sessionUser = getOfflineSessionUser();
      const links = readTable<any>('userCompanies');
      const withCompanyIds = genericList('users').map((u: any) => ({
        ...u,
        companyIds: links.filter((l) => l.userId === u.id).map((l) => l.companyId),
      }));
      // Mirrors UsersService.findAllForCompany() on the real backend: Administrators are visible
      // from every company context; everyone else only shows up where they hold a userCompanies
      // row for the caller's active company — this is what keeps a Manager created under Company A
      // from leaking into Company B's Users & Roles list.
      return withCompanyIds.filter(
        (u) => u.roles?.some((r: any) => r.isSystemRole) || u.companyIds.includes(sessionUser?.companyId),
      );
    }
    if (method === 'post') {
      // Trimmed the same way the real UsersService.create() trims — an accidental leading/
      // trailing space typed into either field must never make the new account unloginable.
      const trimmedCreatePhone = typeof body.phone === 'string' ? body.phone.trim() : body.phone;
      const existingRows = readTable<any>('users');
      if (existingRows.some((r) => r.phone === trimmedCreatePhone)) {
        throw new OfflineApiError('Phone number already in use');
      }
      if (typeof body.email === 'string' && existingRows.some((r) => r.email?.toLowerCase() === body.email.toLowerCase())) {
        throw new OfflineApiError('Email already in use');
      }
      const roles = readTable<any>('roles');
      const assignedRoles = ((body.roleIds ?? []) as string[])
        .map((id) => roles.find((r) => r.id === id))
        .filter(Boolean);
      const { roleIds, companyIds, ...rest } = body;
      // Mirrors UsersService.create() on the real backend: emails are always stored lowercase, so
      // login's case-insensitive lookup never depends on how it happened to be typed at creation.
      const user = genericCreate('users', {
        ...rest,
        phone: trimmedCreatePhone,
        email: typeof rest.email === 'string' ? rest.email.toLowerCase() : rest.email,
        isActive: true,
        roles: assignedRoles,
      });
      // Ignored entirely for a true Administrator — that role has implicit access to every
      // company (see resolveAccessibleCompanyIds), so no ACL rows are needed for it.
      const enforcedCompanyIds = enforceOfflineRoleCompanyRestriction(assignedRoles, companyIds);
      if (enforcedCompanyIds?.length && !assignedRoles.some((r: any) => r.isSystemRole)) {
        const links = readTable<any>('userCompanies');
        for (const companyId of enforcedCompanyIds as string[]) {
          links.push({ id: genId(), userId: user.id, companyId });
        }
        writeTable('userCompanies', links);
      }
      syncOfflineBranchManagerRepresentative(user, assignedRoles, body.branchId);
      syncOfflineBranchManagerEmployee(user, assignedRoles, body.branchId);
      return user;
    }

    if (seg1 && !seg2 && method === 'patch') {
      const rows = readTable<any>('users');
      const row = rows.find((r) => r.id === seg1);
      if (!row) throw new OfflineApiError('Not found');
      assertOfflineUserVisibleToSession(row);
      if (row.email?.toLowerCase() === OFFLINE_ADMIN_EMAIL) {
        throw new OfflineApiError('The primary system administrator account cannot be edited');
      }
      const { roleIds, password, companyIds, ...rest } = body;
      if (roleIds) {
        const roles = readTable<any>('roles');
        row.roles = (roleIds as string[]).map((id: string) => roles.find((r) => r.id === id)).filter(Boolean);
      }
      // Trimmed the same way the real UsersService.update() trims — an admin pasting a phone with
      // an accidental leading/trailing space must not silently break the account's next login.
      if (typeof rest.phone === 'string') rest.phone = rest.phone.trim();
      if (typeof rest.phone === 'string' && rest.phone !== row.phone && rows.some((r) => r.id !== row.id && r.phone === rest.phone)) {
        throw new OfflineApiError('Phone number already in use');
      }
      if (typeof rest.email === 'string' && rest.email.toLowerCase() !== row.email?.toLowerCase() && rows.some((r) => r.id !== row.id && r.email?.toLowerCase() === rest.email.toLowerCase())) {
        throw new OfflineApiError('Email already in use');
      }
      // Mirrors the create handler above: this offline mock never hashes passwords (it has no
      // real auth to begin with — see resolveOfflineUser), only omitted here when left blank.
      if (password) row.password = password;
      if (typeof rest.email === 'string') rest.email = rest.email.toLowerCase();
      Object.assign(row, rest);
      writeTable('users', rows);
      // Present (even an empty array) means "replace the full set" — same convention as roleIds.
      // row.roles already reflects any role change made above, so a switch onto/off a restricted
      // role takes effect in the same request that changed it.
      if (companyIds) {
        const enforcedCompanyIds = enforceOfflineRoleCompanyRestriction(row.roles ?? [], companyIds);
        const links = readTable<any>('userCompanies').filter((l) => l.userId !== seg1);
        for (const companyId of enforcedCompanyIds ?? []) {
          links.push({ id: genId(), userId: seg1, companyId });
        }
        writeTable('userCompanies', links);
      }
      syncOfflineBranchManagerRepresentative(row, row.roles ?? [], row.branchId);
      syncOfflineBranchManagerEmployee(row, row.roles ?? [], row.branchId);
      return row;
    }
    if (seg1 && method === 'delete') {
      const user = findOne<any>('users', seg1);
      assertOfflineUserVisibleToSession(user);
      if (user.email?.toLowerCase() === OFFLINE_ADMIN_EMAIL) {
        throw new OfflineApiError('The primary system administrator account cannot be deleted');
      }
      cascadeDeleteOfflineUserRecords(seg1);
      return genericDelete('users', seg1);
    }
  }
  if (seg0 === 'roles') {
    if (method === 'get') return genericList('roles');
  }

  // --- Dashboard ---------------------------------------------------------------------
  if (seg0 === 'dashboard') {
    const dashboardCompanyId = getOfflineSessionUser()?.companyId ?? OFFLINE_COMPANY_ID;
    if (seg1 === 'summary') return buildDashboardSummary(dashboardCompanyId, resolveOfflineBranchId(params?.branchId) ?? undefined);
    if (seg1 === 'charts' && seg2 === 'sales')
      return buildSalesChart(dashboardCompanyId, resolveOfflineBranchId(params?.branchId) ?? undefined);
    if (seg1 === 'charts' && seg2 === 'purchases') return [];
    if (seg1 === 'top-selling-products') return buildTopSellingProducts(dashboardCompanyId);
    if (seg1 === 'expired-products') return [];
    if (seg1 === 'recent-transactions') return buildRecentTransactions(dashboardCompanyId);
    if (seg1 === 'cash-ledger') return buildCashLedger(dashboardCompanyId, resolveOfflineBranchId(undefined) ?? undefined);
  }

  // Unrecognized route: fall through as "no data" for GET, error for writes.
  if (method === 'get') return seg3 || seg2 ? {} : [];
  throw new OfflineApiError(`This action isn't available yet in offline mode (${method.toUpperCase()} /${path}).`);
}
