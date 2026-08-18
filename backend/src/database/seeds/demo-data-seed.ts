import 'reflect-metadata';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../data-source';
import { Company } from '../../modules/settings/entities/company.entity';
import { Branch } from '../../modules/settings/entities/branch.entity';
import { Warehouse } from '../../modules/settings/entities/warehouse.entity';
import { Unit } from '../../modules/settings/entities/unit.entity';
import { PackageType } from '../../modules/settings/entities/package-type.entity';
import { Tax } from '../../modules/settings/entities/tax.entity';
import { Role } from '../../modules/users/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';
import { UserCompany } from '../../modules/users/entities/user-company.entity';
import { Customer } from '../../modules/parties/customers/entities/customer.entity';
import { Supplier } from '../../modules/parties/suppliers/entities/supplier.entity';
import { SalesRepresentative } from '../../modules/parties/entities/sales-representative.entity';
import { Employee } from '../../modules/hr/entities/employee.entity';
import { Product } from '../../modules/inventory/products/entities/product.entity';
import { StockLevel } from '../../modules/inventory/stock-movements/entities/stock-level.entity';
import { PurchaseReceipt } from '../../modules/inventory/stock-movements/entities/purchase-receipt.entity';
import { SalesInvoice, SalesInvoiceLine } from '../../modules/sales/sales-invoices/entities/sales-invoice.entity';
import { SalesPayment } from '../../modules/sales/sales-payments/entities/sales-payment.entity';
import { CashMovement } from '../../modules/treasury/entities/cash-movement.entity';
import {
  ProductType,
  SaleUnitKind,
  SalesDocumentStatus,
  PaymentMethod,
  CashMovementAccount,
  CashMovementType,
  CashMovementSourceType,
} from '../../entities/enums';

dotenv.config();

/**
 * Populates realistic Arabic demo/test data (suppliers, products, stock, customers, sales reps,
 * employees, a per-company Manager login, and a spread of cash/credit/partially-paid sales
 * invoices) on top of what run-seed.ts already created (companies, branches, warehouses, base
 * settings, roles/permissions, the admin account). Run run-seed.ts first.
 *
 * This system has no double-entry chart of accounts — treasury movement is tracked directly via
 * CashMovement rows (see that entity's doc comment), and "monthly revenue" reports are already
 * computed from actual CashMovement INCOME rows, not invoice totals — so a credit sale's unpaid
 * balance is automatically excluded from revenue simply by never getting a CashMovement row here.
 * Nothing extra needs to be built for that; this seeder only needs to leave unpaid amounts alone.
 */

let docCounter = 0;
function nextDoc(prefix: string, companyCode: string): string {
  docCounter += 1;
  return `${prefix}-${companyCode}-${String(docCounter).padStart(4, '0')}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Weighted-average cost update, mirroring PurchaseReceiptsService: blends the existing
 * quantity/cost with the newly received quantity/cost. */
function weightedAverage(oldQty: number, oldAvg: number, addQty: number, addCost: number): number {
  const newQty = oldQty + addQty;
  if (newQty <= 0) return addCost;
  return (oldQty * oldAvg + addQty * addCost) / newQty;
}

async function receivePurchase(opts: {
  product: Product;
  warehouse: Warehouse;
  supplier: Supplier;
  company: Company;
  branch: Branch;
  createdById: string;
  quantityPackages: number;
  packagePurchasePrice: number;
  markupPercent: number;
  paidAmount: number;
  paymentAccount: CashMovementAccount;
}) {
  const {
    product, warehouse, supplier, company, branch, createdById,
    quantityPackages, packagePurchasePrice, markupPercent, paidAmount, paymentAccount,
  } = opts;

  const stockLevelRepo = AppDataSource.getRepository(StockLevel);
  const productRepo = AppDataSource.getRepository(Product);
  const purchaseReceiptRepo = AppDataSource.getRepository(PurchaseReceipt);
  const cashMovementRepo = AppDataSource.getRepository(CashMovement);

  const unitsPerPackage = Number(product.unitsPerPackage);
  const unitCost = packagePurchasePrice / unitsPerPackage;
  const totalUnits = quantityPackages * unitsPerPackage;
  const totalAmount = quantityPackages * packagePurchasePrice;

  let stockLevel = await stockLevelRepo.findOne({ where: { productId: product.id, warehouseId: warehouse.id } });
  if (!stockLevel) {
    stockLevel = stockLevelRepo.create({
      companyId: company.id,
      productId: product.id,
      warehouseId: warehouse.id,
      quantityOnHand: 0,
      averageCost: 0,
    });
  }
  const newAvgCost = weightedAverage(Number(stockLevel.quantityOnHand), Number(stockLevel.averageCost), totalUnits, unitCost);
  stockLevel.quantityOnHand = Number(stockLevel.quantityOnHand) + totalUnits;
  stockLevel.averageCost = newAvgCost;
  await stockLevelRepo.save(stockLevel);

  product.averageCost = newAvgCost;
  product.purchasePrice = unitCost;
  product.packagePurchasePrice = packagePurchasePrice;
  product.packageSellingPrice = packagePurchasePrice * (1 + markupPercent);
  product.sellingPrice = unitCost * (1 + markupPercent);
  await productRepo.save(product);

  const receipt = await purchaseReceiptRepo.save(
    purchaseReceiptRepo.create({
      companyId: company.id,
      documentNumber: nextDoc('PUR', company.code),
      receiptDate: daysAgo(20),
      productId: product.id,
      warehouseId: warehouse.id,
      supplierId: supplier.id,
      branchId: branch.id,
      quantityPackages,
      unitsPerPackage,
      totalUnits,
      packagePurchasePrice,
      unitCost,
      totalAmount,
      paidAmount,
      packageSellingPrice: product.packageSellingPrice,
      unitSellingPrice: product.sellingPrice,
      createdById,
    }),
  );

  if (paidAmount > 0) {
    await cashMovementRepo.save(
      cashMovementRepo.create({
        documentNumber: nextDoc('CM', company.code),
        movementDate: receipt.receiptDate,
        type: CashMovementType.EXPENSE,
        account: paymentAccount,
        amount: paidAmount,
        sourceType: CashMovementSourceType.PURCHASE_RECEIPT,
        sourceId: receipt.id,
        partySupplierId: supplier.id,
        companyId: company.id,
        branchId: branch.id,
        createdById,
        description: `دفعة على فاتورة شراء ${receipt.documentNumber}`,
      }),
    );
  }

  return { receipt, stockLevel };
}

async function main() {
  await AppDataSource.initialize();
  console.log('Data source initialized for demo data seeding.');

  const companyRepo = AppDataSource.getRepository(Company);
  const branchRepo = AppDataSource.getRepository(Branch);
  const warehouseRepo = AppDataSource.getRepository(Warehouse);
  const unitRepo = AppDataSource.getRepository(Unit);
  const packageTypeRepo = AppDataSource.getRepository(PackageType);
  const taxRepo = AppDataSource.getRepository(Tax);
  const roleRepo = AppDataSource.getRepository(Role);
  const userRepo = AppDataSource.getRepository(User);
  const userCompanyRepo = AppDataSource.getRepository(UserCompany);
  const customerRepo = AppDataSource.getRepository(Customer);
  const supplierRepo = AppDataSource.getRepository(Supplier);
  const salesRepRepo = AppDataSource.getRepository(SalesRepresentative);
  const employeeRepo = AppDataSource.getRepository(Employee);
  const productRepo = AppDataSource.getRepository(Product);
  const salesInvoiceRepo = AppDataSource.getRepository(SalesInvoice);
  const salesPaymentRepo = AppDataSource.getRepository(SalesPayment);
  const cashMovementRepo = AppDataSource.getRepository(CashMovement);
  const stockLevelRepo = AppDataSource.getRepository(StockLevel);

  const managerRole = await roleRepo.findOne({ where: { name: 'Manager' } });
  const adminUser = await userRepo
    .createQueryBuilder('user')
    .innerJoin('user.roles', 'role')
    .where('role."isSystemRole" = true')
    .getOne();
  if (!adminUser) {
    throw new Error('No system admin found — run `npm run seed` (run-seed.ts) first.');
  }
  if (!managerRole) {
    throw new Error('Manager role not found — run `npm run seed` (run-seed.ts) first.');
  }

  type CompanyPlan = {
    code: string;
    products: { nameAr: string; nameEn: string; packageCode: string; unitsPerPackage: number; basePrice: number }[];
    suppliers: { code: string; companyName: string; contactPerson: string }[];
    customers: { code: string; name: string; mobile: string }[];
  };

  const PLANS: CompanyPlan[] = [
    {
      code: 'STAT',
      products: [
        { nameAr: 'كرتونة ورق طباعة A4', nameEn: 'A4 Paper Carton', packageCode: 'CARTON', unitsPerPackage: 10, basePrice: 45 },
        { nameAr: 'علبة دبابيس تدبيس', nameEn: 'Stapler Pins Box', packageCode: 'BOX', unitsPerPackage: 20, basePrice: 8 },
        { nameAr: 'شداير أقلام حبر جاف', nameEn: 'Ballpoint Pens Bundle', packageCode: 'SHAD', unitsPerPackage: 12, basePrice: 15 },
      ],
      suppliers: [
        { code: 'SUP-STAT-1', companyName: 'مؤسسة النيل للورق والقرطاسية', contactPerson: 'محمود سعيد' },
        { code: 'SUP-STAT-2', companyName: 'شركة الدلتا لمستلزمات المكاتب', contactPerson: 'هند عبد الرحمن' },
      ],
      customers: [
        { code: 'CUST-STAT-1', name: 'مكتبة الفرقان', mobile: '01011122233' },
        { code: 'CUST-STAT-2', name: 'مدارس المستقبل الخاصة', mobile: '01022233344' },
        { code: 'CUST-STAT-3', name: 'شركة النور للدعاية والإعلان', mobile: '01033344455' },
      ],
    },
    {
      code: 'AC',
      products: [
        { nameAr: 'تكييف سبليت 1.5 حصان', nameEn: 'Split AC 1.5HP', packageCode: 'PIECE', unitsPerPackage: 1, basePrice: 380 },
        { nameAr: 'كمبروسر تكييف', nameEn: 'AC Compressor', packageCode: 'PIECE', unitsPerPackage: 1, basePrice: 120 },
        { nameAr: 'أنبوبة فريون R410', nameEn: 'R410 Freon Cylinder', packageCode: 'BAG', unitsPerPackage: 1, basePrice: 60 },
      ],
      suppliers: [
        { code: 'SUP-AC-1', companyName: 'شركة الخليج لتوريد أجهزة التكييف', contactPerson: 'عمرو فتحي' },
        { code: 'SUP-AC-2', companyName: 'مؤسسة الأمل للتبريد والتكييف', contactPerson: 'سامية أحمد' },
      ],
      customers: [
        { code: 'CUST-AC-1', name: 'فندق النيل الأزرق', mobile: '01044455566' },
        { code: 'CUST-AC-2', name: 'مجمع عيادات الشفاء', mobile: '01055566677' },
        { code: 'CUST-AC-3', name: 'مصنع الأمانة للألبان', mobile: '01066677788' },
      ],
    },
    {
      code: 'PRESS',
      products: [
        { nameAr: 'بكرة ورق طباعة أوفست', nameEn: 'Offset Paper Roll', packageCode: 'ROLL', unitsPerPackage: 1, basePrice: 210 },
        { nameAr: 'علبة حبر طباعة أوفست', nameEn: 'Offset Ink Box', packageCode: 'BOX', unitsPerPackage: 4, basePrice: 90 },
        { nameAr: 'بالة كرتون تغليف', nameEn: 'Packaging Cardboard Bale', packageCode: 'BALE', unitsPerPackage: 50, basePrice: 130 },
      ],
      suppliers: [
        { code: 'SUP-PRESS-1', companyName: 'مصنع الأهرام للورق والطباعة', contactPerson: 'كريم منصور' },
        { code: 'SUP-PRESS-2', companyName: 'شركة سيناء للأحبار الصناعية', contactPerson: 'إيمان طه' },
      ],
      customers: [
        { code: 'CUST-PRESS-1', name: 'دار الكتب للنشر والتوزيع', mobile: '01077788899' },
        { code: 'CUST-PRESS-2', name: 'شركة بصمة للدعاية والإعلان', mobile: '01088899900' },
        { code: 'CUST-PRESS-3', name: 'مجلة القاهرة اليوم', mobile: '01099900011' },
      ],
    },
  ];

  for (const plan of PLANS) {
    const company = await companyRepo.findOne({ where: { code: plan.code } });
    if (!company) {
      console.log(`Skipping ${plan.code} — company not found, run run-seed.ts first.`);
      continue;
    }
    const branch = await branchRepo.findOne({ where: { companyId: company.id, code: 'HQ' } });
    const warehouse = await warehouseRepo.findOne({ where: { companyId: company.id, code: 'WH-MAIN' } });
    const pcsUnit = await unitRepo.findOne({ where: { companyId: company.id, code: 'PCS' } });
    const vat = await taxRepo.findOne({ where: { companyId: company.id, code: 'VAT14' } });
    if (!branch || !warehouse || !pcsUnit) {
      console.log(`Skipping ${plan.code} — base settings missing, run run-seed.ts first.`);
      continue;
    }

    const alreadySeeded = await customerRepo.findOne({ where: { companyId: company.id, code: plan.customers[0].code } });
    if (alreadySeeded) {
      console.log(`${plan.code} already has demo data — skipping.`);
      continue;
    }

    // --- Suppliers ---
    const suppliers: Supplier[] = [];
    for (const s of plan.suppliers) {
      suppliers.push(
        await supplierRepo.save(
          supplierRepo.create({ ...s, companyId: company.id, isActive: true, openingBalance: 0 }),
        ),
      );
    }

    // --- Products + opening stock via Purchase Receipts ---
    const products: Product[] = [];
    for (const p of plan.products) {
      const packageType = await packageTypeRepo.findOne({ where: { companyId: company.id, code: p.packageCode } });
      if (!packageType) continue;
      const product = await productRepo.save(
        productRepo.create({
          companyId: company.id,
          nameAr: p.nameAr,
          nameEn: p.nameEn,
          unitId: pcsUnit.id,
          packageTypeId: packageType.id,
          unitsPerPackage: p.unitsPerPackage,
          taxId: vat?.id ?? null,
          productType: ProductType.RAW_MATERIAL,
          isActive: true,
        }),
      );
      products.push(product);

      const supplier = suppliers[products.length % suppliers.length];
      await receivePurchase({
        product,
        warehouse,
        supplier,
        company,
        branch,
        createdById: adminUser.id,
        quantityPackages: 30,
        packagePurchasePrice: p.basePrice,
        markupPercent: 0.35,
        paidAmount: p.basePrice * 30 * 0.6,
        paymentAccount: CashMovementAccount.BANK,
      });
    }

    // --- Sales representative ---
    const rep = await salesRepRepo.save(
      salesRepRepo.create({
        code: `REP-${plan.code}-1`,
        name: plan.code === 'STAT' ? 'أحمد عبد الله' : plan.code === 'AC' ? 'محمد إبراهيم' : 'يوسف كمال',
        phone: '0100' + Math.floor(1000000 + Math.random() * 8999999),
        branchId: branch.id,
        commissionRate: 2.5,
        monthlyTarget: 20000,
        isActive: true,
        companyId: company.id,
      }),
    );

    // --- Employees (accountant + sales, sharing the Employee model — this system has no
    // separate accountant/sales role in RBAC, only Administrator/Manager/مدير فرع; these are HR
    // records for payroll purposes, not extra login roles) ---
    await employeeRepo.save(
      employeeRepo.create({ companyId: company.id, branchId: branch.id, name: 'سارة محمود', jobTitle: 'محاسب', baseSalary: 6000, isActive: true }),
    );
    await employeeRepo.save(
      employeeRepo.create({ companyId: company.id, branchId: branch.id, name: rep.name, jobTitle: 'مندوب مبيعات', baseSalary: 4500, isActive: true, userId: null }),
    );

    // --- A branch Manager login for this company ---
    const managerPhone = '010' + (plan.code === 'STAT' ? '1' : plan.code === 'AC' ? '2' : '3') + '0000001';
    const existingManagerUser = await userRepo.findOne({ where: { phone: managerPhone } });
    if (!existingManagerUser) {
      // No hardcoded fallback, deliberately — a demo Manager password shipped fixed in source is
      // still a real, guessable credential once this script has ever been run against a database
      // (this script is manual-only, never auto-run by docker-compose, but the account it creates
      // persists once seeded).
      const demoManagerPassword = process.env.SEED_DEMO_MANAGER_PASSWORD;
      if (!demoManagerPassword) {
        throw new Error(
          'SEED_DEMO_MANAGER_PASSWORD must be set to seed the demo Manager accounts — no default password is provided.',
        );
      }
      const managerUser = await userRepo.save(
        userRepo.create({
          fullName: `مدير ${company.nameAr}`,
          phone: managerPhone,
          passwordHash: await argon2.hash(demoManagerPassword),
          companyId: company.id,
          branchId: branch.id,
          roles: [managerRole],
        }),
      );
      await userCompanyRepo.save(userCompanyRepo.create({ userId: managerUser.id, companyId: company.id }));
      console.log(`Manager login seeded for ${plan.code}: ${managerPhone}`);
    }

    // --- Customers ---
    const customers: Customer[] = [];
    for (const c of plan.customers) {
      customers.push(
        await customerRepo.save(
          customerRepo.create({
            ...c,
            companyId: company.id,
            salesRepresentativeId: rep.id,
            creditLimit: 20000,
            openingBalance: 0,
            isActive: true,
          }),
        ),
      );
    }

    // --- Sales invoices: cash-paid-in-full, credit-unpaid, and partially-paid ---
    const paymentPlans: { status: SalesDocumentStatus; paidRatio: number }[] = [
      { status: SalesDocumentStatus.PAID, paidRatio: 1 },
      { status: SalesDocumentStatus.CONFIRMED, paidRatio: 0 },
      { status: SalesDocumentStatus.PARTIALLY_PAID, paidRatio: 0.5 },
    ];

    for (let i = 0; i < customers.length; i += 1) {
      const customer = customers[i];
      const plan_ = paymentPlans[i % paymentPlans.length];
      const product = products[i % products.length];
      const stockLevel = await stockLevelRepo.findOne({ where: { productId: product.id, warehouseId: warehouse.id } });
      if (!stockLevel) continue;

      const unitKind = i % 2 === 0 ? SaleUnitKind.PACKAGE : SaleUnitKind.UNIT;
      const quantity = unitKind === SaleUnitKind.PACKAGE ? 2 : 5;
      const baseQuantity = unitKind === SaleUnitKind.PACKAGE ? quantity * Number(product.unitsPerPackage) : quantity;
      const unitPrice = unitKind === SaleUnitKind.PACKAGE ? Number(product.packageSellingPrice) : Number(product.sellingPrice);
      const lineTotal = quantity * unitPrice;
      const unitCostPerBase = Number(stockLevel.averageCost);
      const lineCost = baseQuantity * unitCostPerBase;
      const lineProfit = lineTotal - lineCost;

      const invoiceDate = daysAgo(10 - i);
      const invoice = await salesInvoiceRepo.save(
        salesInvoiceRepo.create({
          documentNumber: nextDoc('INV', company.code),
          invoiceDate,
          dueDate: plan_.status === SalesDocumentStatus.CONFIRMED ? daysAgo(-20) : null,
          customerId: customer.id,
          warehouseId: warehouse.id,
          companyId: company.id,
          branchId: branch.id,
          salesRepresentativeId: rep.id,
          status: plan_.status,
          subtotal: lineTotal,
          grandTotal: lineTotal,
          amountPaid: lineTotal * plan_.paidRatio,
          costOfGoodsSold: lineCost,
          totalProfit: lineProfit,
          createdById: adminUser.id,
          lines: [
            {
              productId: product.id,
              unitKind,
              quantity,
              baseQuantity,
              unitPrice,
              lineTotal,
              unitCost: unitCostPerBase,
              purchasePrice: unitKind === SaleUnitKind.PACKAGE ? Number(product.packagePurchasePrice) : Number(product.purchasePrice),
              suggestedPrice: unitPrice,
              profitPerUnit: quantity > 0 ? lineProfit / quantity : 0,
              totalProfit: lineProfit,
            } as SalesInvoiceLine,
          ],
        }),
      );

      stockLevel.quantityOnHand = Number(stockLevel.quantityOnHand) - baseQuantity;
      await stockLevelRepo.save(stockLevel);

      const paidAmount = lineTotal * plan_.paidRatio;
      if (paidAmount > 0) {
        const payment = await salesPaymentRepo.save(
          salesPaymentRepo.create({
            documentNumber: nextDoc('RCT', company.code),
            paymentDate: invoiceDate,
            customerId: customer.id,
            companyId: company.id,
            branchId: branch.id,
            invoiceId: invoice.id,
            salesRepresentativeId: rep.id,
            method: PaymentMethod.CASH,
            paymentAccount: CashMovementAccount.CASH,
            amount: paidAmount,
            createdById: adminUser.id,
          }),
        );
        const cashMovement = await cashMovementRepo.save(
          cashMovementRepo.create({
            documentNumber: nextDoc('CM', company.code),
            movementDate: invoiceDate,
            type: CashMovementType.INCOME,
            account: CashMovementAccount.CASH,
            amount: paidAmount,
            sourceType: CashMovementSourceType.SALES_PAYMENT,
            sourceId: payment.id,
            partyCustomerId: customer.id,
            companyId: company.id,
            branchId: branch.id,
            createdById: adminUser.id,
            description: `تحصيل فاتورة ${invoice.documentNumber}`,
          }),
        );
        payment.cashMovementId = cashMovement.id;
        await salesPaymentRepo.save(payment);
      }
    }

    console.log(`Demo data seeded for ${plan.code}: ${suppliers.length} suppliers, ${products.length} products, ${customers.length} customers, ${customers.length} invoices.`);
  }

  console.log('Demo data seeding complete.');
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Demo data seeding failed:', err);
  process.exit(1);
});
