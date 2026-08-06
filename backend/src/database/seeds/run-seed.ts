import 'reflect-metadata';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../data-source';
import { Company } from '../../modules/settings/entities/company.entity';
import { Branch } from '../../modules/settings/entities/branch.entity';
import { Warehouse } from '../../modules/settings/entities/warehouse.entity';
import { Currency } from '../../modules/settings/entities/currency.entity';
import { Tax } from '../../modules/settings/entities/tax.entity';
import { Unit } from '../../modules/settings/entities/unit.entity';
import { PackageType } from '../../modules/settings/entities/package-type.entity';
import { ProductCategory } from '../../modules/settings/entities/product-category.entity';
import { Brand } from '../../modules/settings/entities/brand.entity';
import { FiscalYear } from '../../modules/settings/entities/fiscal-year.entity';
import { NumberingSeries } from '../../modules/settings/entities/numbering-series.entity';
import { Permission, PermissionAction } from '../../modules/users/entities/permission.entity';
import { Role } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { UserCompany } from '../../modules/users/entities/user-company.entity';
import { Customer } from '../../modules/parties/customers/entities/customer.entity';

dotenv.config();

/** Mirrors frontend/src/lib/use-active-company.ts's PRINTING_PRESS_COMPANY_CODE — kept as a
 * literal here too since this seed script has no dependency on frontend code. */
const PRINTING_PRESS_COMPANY_CODE = 'PRESS';

const PERMISSION_MATRIX: Record<string, PermissionAction[]> = {
  users: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  roles: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  customers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  suppliers: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  'sales-representatives': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'accounting.cost-center': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'accounting.project': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'accounting.budget': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'security.audit-log': [PermissionAction.VIEW],
  dashboard: [PermissionAction.VIEW],
  // Split out from dashboard.view (which the Reports nav item/routes used to share) so a role can
  // be granted dashboard access without also unlocking التقارير المالية, or vice versa — see the
  // Manager role below, which intentionally gets only dashboard.view.
  'accounting.reports': [PermissionAction.VIEW],
  notifications: [PermissionAction.VIEW],
  'inventory.product': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'inventory.stock': [PermissionAction.VIEW, PermissionAction.EDIT],
  // "الجرد الشهري" (Printing Press only) — EDIT/DELETE are only ever honored by the service while
  // the audit is still CONFIRMED (not yet approved); once APPROVED it stays immutable since
  // reversing its already-applied stock changes needs the same reversal machinery a delete would.
  // APPROVE gates the separate administrative step that actually reconciles stock.
  'inventory.stockAudit': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
    PermissionAction.APPROVE,
  ],
  'inventory.purchaseReceipt': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'purchasing.request': [PermissionAction.VIEW, PermissionAction.CREATE],
  'purchasing.order': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'purchasing.invoice': [PermissionAction.VIEW, PermissionAction.CREATE],
  'purchasing.payment': [PermissionAction.VIEW, PermissionAction.CREATE],
  'sales.quotation': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
    PermissionAction.APPROVE,
  ],
  'sales.order': [PermissionAction.VIEW, PermissionAction.CREATE],
  'sales.invoice': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
    PermissionAction.SELL_BELOW_COST,
  ],
  'sales.payment': [PermissionAction.VIEW, PermissionAction.CREATE],
  // Separate from sales.payment.view: gates only the standalone /sales/payments list page and
  // its sidebar entry, so a role can keep sales.payment.view/create (needed for the embedded
  // receipts list and "collect payment" action on Customer Balance / Sales Invoice pages)
  // without being able to open the full payments list screen.
  'sales.paymentList': [PermissionAction.VIEW],
  'sales.installmentPlan': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
    PermissionAction.APPROVE,
  ],
  'settings.branch': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.company': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.currency': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.fiscal-year': [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.APPROVE],
  'settings.numbering-series': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.product-category': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.brand': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.unit': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.packageType': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.expenseCategory': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.partner': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'treasury.expense': [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  partners: [PermissionAction.VIEW, PermissionAction.CREATE, PermissionAction.EDIT, PermissionAction.DELETE],
  'settings.warehouse': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'settings.tax': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'treasury.cash-box': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'treasury.bank-account': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'imports.cargo': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'imports.shipment': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'imports.shippingExpenseType': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  'imports.shipmentPayment': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  // Gates the factory-reset action (wipes transactional/demo data, keeps configuration and
  // logins) — deliberately its own module rather than folded into settings.*, and deliberately
  // never granted to Manager, so only a true Administrator can ever reach it.
  system: [PermissionAction.DELETE],
  // "الموظفين" — applies to every company/branch. Sensitive payroll data, so deliberately never
  // granted to Manager (same reasoning as system above) — only Administrator has it by default.
  'hr.employee': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
  // APPROVE is the step that actually posts net salaries into operating expenses (see
  // PayrollService.approve()) — CONFIRMED→APPROVED is one-way, so this can only happen once per
  // run, which is what prevents double-posting the same month's payroll.
  'hr.payroll': [
    PermissionAction.VIEW,
    PermissionAction.CREATE,
    PermissionAction.APPROVE,
    PermissionAction.EDIT,
    PermissionAction.DELETE,
  ],
};

async function main() {
  await AppDataSource.initialize();

  // --- Permissions ---
  const permissionRepo = AppDataSource.getRepository(Permission);
  const allPermissions: Permission[] = [];
  for (const [module, actions] of Object.entries(PERMISSION_MATRIX)) {
    for (const action of actions) {
      let permission = await permissionRepo.findOne({ where: { module, action } });
      if (!permission) {
        permission = await permissionRepo.save(permissionRepo.create({ module, action }));
      }
      allPermissions.push(permission);
    }
  }
  console.log(`Permissions seeded: ${allPermissions.length}`);

  // --- Administrator role ---
  const roleRepo = AppDataSource.getRepository(Role);
  let adminRole = await roleRepo.findOne({ where: { name: 'Administrator' } });
  if (!adminRole) {
    adminRole = roleRepo.create({
      name: 'Administrator',
      description: 'Full system access',
      isSystemRole: true,
      permissions: allPermissions,
    });
  } else {
    adminRole.permissions = allPermissions;
  }
  await roleRepo.save(adminRole);
  console.log('Administrator role seeded');

  // --- Manager role ("مدير فرع" / Branch Manager) — widened per the Printing Press branch spec:
  // full Dashboard access; Purchasing (suppliers, products/raw-materials, purchase receipts) is
  // deliberately capped at view+create only — no edit/delete — since letting a branch manager
  // alter or erase what's already been recorded (supplier terms, received-material counts, invoice
  // history) is exactly what the business wants to prevent, and inventory.product is shared by both
  // the raw-materials screen and the Press-only sellable-products catalog so this single view+create
  // grant applies to both uses; Sales (quotations/invoices/payments), Treasury expenses, and Payroll
  // get full management since nothing in the spec restricts those verbs; hr.employee.view is a
  // technical prerequisite only (PayrollPage's "new run" flow reads GET /hr/employees to build line
  // items) — it does NOT grant employee CRUD, which was never requested; Financial Reports and
  // treasury cash-box tracking stay view-only; Monthly Stock Audit gets view+create ("conduct and
  // record") but never approve, which the spec reserves exclusively for Administrator; Settings gets
  // full management across every sub-module EXCEPT settings.partner (Partners/percentages) and
  // system (factory reset — already unreachable by any non-system role regardless of permissions,
  // see SettingsPage.tsx's canFactoryReset = hasPermission('system.delete') && isSystemRole).
  // `sales-representatives.view` is kept so the Manager's own "مدراء الفروع" sidebar entry stays
  // visible; the actual branch scoping of everything this role can see/do comes from
  // SalesRepAccessService.resolveBranchId(), keyed off the SalesRepresentative row an admin links to
  // this user (with its own branchId) via that same مدراء الفروع screen — not from a role-level flag.
  // Deliberately NOT setting restrictedCompanyId here (unlike the separate 'مدير فرع' role below):
  // this role is shared with a non-Press user (Stationery), and restrictedCompanyId would forcibly
  // relocate that user to Press. Press-exclusive screens (stock audit, printing products) stay
  // naturally inaccessible to non-Press users of this role via RequirePrintingPress, independent of
  // these permission grants.
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
  const managerPermissions = allPermissions.filter((p) =>
    MANAGER_PERMISSION_CODES.includes(`${p.module}.${p.action}`),
  );
  let managerRole = await roleRepo.findOne({ where: { name: 'Manager' } });
  if (!managerRole) {
    managerRole = roleRepo.create({
      name: 'Manager',
      description:
        'Branch manager — full dashboard, sales, treasury/payroll and general settings management; purchasing (suppliers/products/purchase receipts) limited to view+create; financial reports view-only; monthly stock audit conduct+record without approval; partners and factory reset blocked',
      isSystemRole: false,
      permissions: managerPermissions,
    });
  } else {
    managerRole.permissions = managerPermissions;
  }
  await roleRepo.save(managerRole);
  console.log('Manager role seeded');

  // --- Companies ---
  // Three fully independent businesses run through this one system — per-company data isolation
  // (companyId on every operational/reference table) means each gets its own branch, warehouse,
  // and starter reference data (currencies/taxes/units/package types/category/brand/fiscal
  // year/numbering series) rather than sharing one global set. See SystemService/CompanyScopedCrudService.
  const COMPANY_DEFS = [
    { code: 'STAT', nameEn: 'Stationery & Printing Supplies', nameAr: 'القرطاسية ومستلزمات الطباعة' },
    { code: 'AC', nameEn: 'Air Conditioning', nameAr: 'التكييفات' },
    { code: 'PRESS', nameEn: 'Printing Press', nameAr: 'المطبعة' },
  ];

  const companyRepo = AppDataSource.getRepository(Company);
  const branchRepo = AppDataSource.getRepository(Branch);
  const warehouseRepo = AppDataSource.getRepository(Warehouse);
  const currencyRepo = AppDataSource.getRepository(Currency);
  const taxRepo = AppDataSource.getRepository(Tax);
  const unitRepo = AppDataSource.getRepository(Unit);
  const packageTypeRepo = AppDataSource.getRepository(PackageType);
  const categoryRepo = AppDataSource.getRepository(ProductCategory);
  const brandRepo = AppDataSource.getRepository(Brand);
  const fiscalYearRepo = AppDataSource.getRepository(FiscalYear);
  const numberingSeriesRepo = AppDataSource.getRepository(NumberingSeries);
  const customerRepo = AppDataSource.getRepository(Customer);

  const seededCompanies: { company: Company; branch: Branch }[] = [];

  for (const def of COMPANY_DEFS) {
    let company = await companyRepo.findOne({ where: { code: def.code } });
    if (!company) {
      company = await companyRepo.save(
        companyRepo.create({ code: def.code, nameEn: def.nameEn, nameAr: def.nameAr, baseCurrencyCode: 'USD' }),
      );
    }

    let branch = await branchRepo.findOne({ where: { companyId: company.id, code: 'HQ' } });
    if (!branch) {
      branch = await branchRepo.save(
        branchRepo.create({
          code: 'HQ',
          nameEn: 'Head Office',
          nameAr: 'المكتب الرئيسي',
          isMainBranch: true,
          companyId: company.id,
        }),
      );
    }

    let warehouse = await warehouseRepo.findOne({ where: { companyId: company.id, code: 'WH-MAIN' } });
    if (!warehouse) {
      warehouse = await warehouseRepo.save(
        warehouseRepo.create({
          code: 'WH-MAIN',
          nameEn: 'Main Warehouse',
          nameAr: 'المستودع الرئيسي',
          isDefault: true,
          companyId: company.id,
          branchId: branch.id,
        }),
      );
    }

    for (const c of [
      { code: 'USD', nameEn: 'US Dollar', nameAr: 'دولار أمريكي', symbol: '$', isBaseCurrency: true },
      { code: 'EGP', nameEn: 'Egyptian Pound', nameAr: 'جنيه مصري', symbol: 'E£', isBaseCurrency: false },
    ]) {
      const existing = await currencyRepo.findOne({ where: { companyId: company.id, code: c.code } });
      if (!existing) await currencyRepo.save(currencyRepo.create({ ...c, companyId: company.id }));
    }

    if (!(await taxRepo.findOne({ where: { companyId: company.id, code: 'VAT14' } }))) {
      await taxRepo.save(
        taxRepo.create({ companyId: company.id, code: 'VAT14', nameEn: 'VAT 14%', nameAr: 'ضريبة القيمة المضافة', rate: 14 }),
      );
    }

    // Created ahead of units/package-types/brands below since all three now require a categoryId
    // (dependent-dropdown filtering by product category) — the seeded ones default to this
    // company-wide "General" bucket; company admins add category-specific ones via Settings.
    let generalCategory = await categoryRepo.findOne({ where: { companyId: company.id, code: 'GEN' } });
    if (!generalCategory) {
      generalCategory = await categoryRepo.save(
        categoryRepo.create({ companyId: company.id, code: 'GEN', nameEn: 'General', nameAr: 'عام' }),
      );
    }

    for (const u of [
      { code: 'PCS', nameEn: 'Piece', nameAr: 'قطعة' },
      { code: 'KG', nameEn: 'Kilogram', nameAr: 'كيلوجرام' },
    ]) {
      if (!(await unitRepo.findOne({ where: { companyId: company.id, code: u.code } })))
        await unitRepo.save(unitRepo.create({ ...u, companyId: company.id, categoryId: generalCategory.id }));
    }

    // Package types (Settings > Packages) — selectable as a product's mandatory "Package" field.
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
      if (!(await packageTypeRepo.findOne({ where: { companyId: company.id, code: p.code } })))
        await packageTypeRepo.save(packageTypeRepo.create({ ...p, companyId: company.id, categoryId: generalCategory.id }));
    }

    if (!(await brandRepo.findOne({ where: { companyId: company.id, code: 'GENERIC' } }))) {
      await brandRepo.save(
        brandRepo.create({ companyId: company.id, code: 'GENERIC', nameEn: 'Generic', categoryId: generalCategory.id }),
      );
    }

    const year = new Date().getFullYear();
    if (!(await fiscalYearRepo.findOne({ where: { companyId: company.id, name: `FY${year}` } }))) {
      await fiscalYearRepo.save(
        fiscalYearRepo.create({
          companyId: company.id,
          name: `FY${year}`,
          startDate: `${year}-01-01`,
          endDate: `${year}-12-31`,
        }),
      );
    }

    const seriesDefs: Array<{ documentType: string; prefix: string }> = [
      { documentType: 'QUOTATION', prefix: 'QUO-' },
      { documentType: 'SALES_ORDER', prefix: 'SO-' },
      { documentType: 'SALES_INVOICE', prefix: 'INV-' },
      { documentType: 'SALES_PAYMENT', prefix: 'RCT-' },
      { documentType: 'CASH_MOVEMENT', prefix: 'CM-' },
      { documentType: 'INSTALLMENT_PLAN', prefix: 'INSTL-' },
      { documentType: 'INSTALLMENT_PAYMENT', prefix: 'INSTLP-' },
    ];
    for (const s of seriesDefs) {
      const existing = await numberingSeriesRepo.findOne({
        where: { companyId: company.id, documentType: s.documentType },
      });
      if (!existing) {
        await numberingSeriesRepo.save(
          numberingSeriesRepo.create({
            companyId: company.id,
            documentType: s.documentType,
            prefix: s.prefix,
            nextNumber: 1,
            padLength: 6,
          }),
        );
      }
    }

    // Printing Press has no customer-management screen at all (confirmed scope: Customers/
    // Outstanding Balances are hidden for this one tenant only) — every sale there is attributed
    // to this single seeded walk-in customer instead, so sales invoices/quotations still have a
    // valid customerId to point at.
    if (company.code === PRINTING_PRESS_COMPANY_CODE) {
      const existingWalkIn = await customerRepo.findOne({ where: { companyId: company.id, code: 'WALKIN' } });
      if (!existingWalkIn) {
        await customerRepo.save(
          customerRepo.create({
            companyId: company.id,
            code: 'WALKIN',
            name: 'عميل نقدي / Walk-in Customer',
            openingBalance: 0,
          }),
        );
      }
    }

    seededCompanies.push({ company, branch });
    console.log(`Company seeded: ${company.code} (${company.nameEn}) / ${branch.code} / ${warehouse.code}`);
  }

  // --- Branch Manager role, Printing Press only ("مدير فرع") ---
  // Seeded here (after the companies loop) rather than alongside Administrator/Manager above,
  // since it needs the Press company's real id for restrictedCompanyId — a distinct, narrower role
  // from the generic "Manager" above: Dashboard (view), Quotations (view+create only, no edit),
  // Products (view only), Sales Invoices (full — view/create/receive payments), Sales (covered by
  // sales.invoice.view), Treasury cash movements (view only, no transaction authority). Every other
  // module is deliberately excluded. `restrictedCompanyId` hard-locks any user given this role to
  // the Printing Press company only (see UsersService.create()/update()). The role's own name is
  // deliberately plain "مدير فرع" (no branch/company suffix baked in) — the *specific* branch is
  // chosen per-user in the Users & Roles "add user" form's conditional branch select, which also
  // auto-provisions a SalesRepresentative row for that user/branch (see
  // UsersService.syncBranchManagerRepresentative()) so they immediately appear under "مدراء
  // الفروع" for an admin to finish their commission/target data.
  const pressCompany = seededCompanies.find((c) => c.company.code === PRINTING_PRESS_COMPANY_CODE)?.company;
  if (pressCompany) {
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
    const branchManagerPressPermissions = allPermissions.filter((p) =>
      BRANCH_MANAGER_PRESS_PERMISSION_CODES.includes(`${p.module}.${p.action}`),
    );
    let branchManagerPressRole =
      (await roleRepo.findOne({ where: { name: 'مدير فرع' } })) ??
      (await roleRepo.findOne({ where: { name: 'مدير فرع - المطبعة' } }));
    if (!branchManagerPressRole) {
      branchManagerPressRole = roleRepo.create({
        name: 'مدير فرع',
        description:
          'Branch manager restricted exclusively to the Printing Press company — dashboard, quotations (view/create), products (view), sales invoices (full incl. payments), sales, and treasury (view only)',
        isSystemRole: false,
        restrictedCompanyId: pressCompany.id,
        permissions: branchManagerPressPermissions,
      });
    } else {
      branchManagerPressRole.name = 'مدير فرع';
      branchManagerPressRole.permissions = branchManagerPressPermissions;
      branchManagerPressRole.restrictedCompanyId = pressCompany.id;
    }
    await roleRepo.save(branchManagerPressRole);
    console.log('Branch Manager (Printing Press) role seeded');
  }

  // --- Admin user ---
  // The Administrator has implicit access to every company via isSystemRole (see
  // AuthService.extractCompanyIds()) — no UserCompany ACL rows are needed for this account. Its
  // single companyId/branchId columns just seed the company it lands on by default at login,
  // switchable afterward via POST /auth/switch-company without a fresh login.
  const defaultCompany = seededCompanies[0];
  const userRepo = AppDataSource.getRepository(User);
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'aymanmakroum83@gmail.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Ayman987654#';
  const adminFullName = process.env.SEED_ADMIN_FULL_NAME || 'أيمن مكرم';
  const adminPhone = process.env.SEED_ADMIN_PHONE || '99970766';
  let adminUser = await userRepo.findOne({ where: { email: adminEmail } });
  // True only the very first time this database is ever seeded (no admin account under any email
  // or identity existed yet) — used below to gate one-time demo-data creation (the "Makroom204"
  // Manager account) so it's never resurrected by a later restart of this script, which runs on
  // every container start per docker-compose.yml (`npm run seed && node dist/main.js`). Without
  // this, a real, deliberate deletion of that account would silently be undone the next time the
  // backend restarts or redeploys — exactly the "delete doesn't stick" symptom this guards against.
  let isFreshDatabase = false;
  if (!adminUser) {
    // No user already holds the current default email — check whether a previously-seeded admin
    // account exists under a different (e.g. older-default, or custom SEED_ADMIN_EMAIL) address,
    // identified by the true Administrator/isSystemRole rather than by email, and migrate that
    // account to the new identity in place instead of creating a second, duplicate admin account.
    const existingSystemAdmin = await userRepo
      .createQueryBuilder('user')
      .innerJoin('user.roles', 'role')
      .where('role."isSystemRole" = true')
      .getOne();

    if (existingSystemAdmin) {
      existingSystemAdmin.email = adminEmail;
      existingSystemAdmin.fullName = adminFullName;
      existingSystemAdmin.phone = adminPhone;
      existingSystemAdmin.passwordHash = await argon2.hash(adminPassword);
      if (!existingSystemAdmin.companyId) {
        existingSystemAdmin.companyId = defaultCompany.company.id;
        existingSystemAdmin.branchId = defaultCompany.branch.id;
      }
      await userRepo.save(existingSystemAdmin);
      console.log(`Admin user migrated to new identity: ${adminEmail}`);
    } else {
      isFreshDatabase = true;
      adminUser = userRepo.create({
        email: adminEmail,
        fullName: adminFullName,
        phone: adminPhone,
        passwordHash: await argon2.hash(adminPassword),
        companyId: defaultCompany.company.id,
        branchId: defaultCompany.branch.id,
        roles: [adminRole],
      });
      await userRepo.save(adminUser);
      console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
    }
  } else {
    // Backfills the phone number on a browser/DB that already had the admin row seeded before this
    // field existed — otherwise re-running the seed against existing data would silently never
    // pick up the new phone number, since this branch used to do nothing at all.
    if (adminUser.phone !== adminPhone) {
      adminUser.phone = adminPhone;
      await userRepo.save(adminUser);
    }
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  // --- Manager user restricted to a single company (القرطاسية ومستلزمات الطباعة) ---
  const statCompany = seededCompanies.find((c) => c.company.code === 'STAT') ?? defaultCompany;
  const userCompanyRepo = AppDataSource.getRepository(UserCompany);
  const extraManagerEmail = 'makroom204@gmail.com';
  const extraManagerPassword = 'makroom204';
  const extraManagerPhone = process.env.SEED_MANAGER_PHONE || '99970704';
  let extraManagerUser = await userRepo.findOne({ where: { email: extraManagerEmail } });
  if (!extraManagerUser && isFreshDatabase) {
    extraManagerUser = userRepo.create({
      email: extraManagerEmail,
      phone: extraManagerPhone,
      fullName: 'Makroom204',
      passwordHash: await argon2.hash(extraManagerPassword),
      companyId: statCompany.company.id,
      branchId: statCompany.branch.id,
      roles: [managerRole],
    });
    await userRepo.save(extraManagerUser);
    console.log(`Manager user created: ${extraManagerEmail} / ${extraManagerPassword}`);
  } else if (extraManagerUser) {
    // Already exists — only (re)apply the STAT-only restriction below, never touch their
    // email/password/name here (unlike the protected primary admin, this is a regular account
    // that might have been edited since, and reseeding must not clobber that).
    console.log(`Manager user already exists: ${extraManagerEmail}`);
  } else {
    // Doesn't exist and this isn't a fresh database — it was deliberately deleted through the
    // real Users & Roles delete flow. A one-time demo convenience must never fight that: skip
    // recreating it, same reasoning as the offline mock's ensureExtraManagerUser() fix.
    console.log(`Manager user (${extraManagerEmail}) not present — skipping (not a fresh database, so not recreating a previously deleted account).`);
  }

  if (extraManagerUser) {
    const existingLink = await userCompanyRepo.findOne({
      where: { userId: extraManagerUser.id, companyId: statCompany.company.id },
    });
    if (!existingLink) {
      await userCompanyRepo.save(userCompanyRepo.create({ userId: extraManagerUser.id, companyId: statCompany.company.id }));
    }
  }

  await AppDataSource.destroy();
  console.log('Seed complete.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
