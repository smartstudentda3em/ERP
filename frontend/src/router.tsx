import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/auth/RequireAuth';
import { RequirePermission } from './components/auth/RequirePermission';
import { RequireNotPrintingPress } from './components/auth/RequireNotPrintingPress';
import { RequireAirConditioning } from './components/auth/RequireAirConditioning';
import { RequirePrintingPress } from './components/auth/RequirePrintingPress';
import { LoginPage } from './features/auth/LoginPage';
import { CompanySelectPage } from './features/auth/CompanySelectPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { CustomersPage } from './features/customers/CustomersPage';
import { CustomerStatementPage } from './features/customers/CustomerStatementPage';
import { OutstandingBalancesPage } from './features/customers/OutstandingBalancesPage';
import { OutstandingBalanceDetailPage } from './features/customers/OutstandingBalanceDetailPage';
import { OutstandingBalanceDetailsPage } from './features/customers/OutstandingBalanceDetailsPage';
import { SuppliersPage } from './features/suppliers/SuppliersPage';
import { ShipmentDetailPage } from './features/suppliers/ShipmentDetailPage';
import { SupplierStatementPage } from './features/suppliers/SupplierStatementPage';
import { SalesRepresentativesPage } from './features/sales-representatives/SalesRepresentativesPage';
import { ProductsPage } from './features/inventory/ProductsPage';
import { PrintingProductsPage } from './features/inventory/PrintingProductsPage';
import { StockPage } from './features/inventory/StockPage';
import { WarehousesPage } from './features/inventory/WarehousesPage';
import { StockAuditPage } from './features/inventory/StockAuditPage';
import { StockAuditDetailPage } from './features/inventory/StockAuditDetailPage';
import { ProductOverviewPage } from './features/inventory/ProductOverviewPage';
import { QuotationsPage } from './features/sales/QuotationsPage';
import { QuotationDetailPage } from './features/sales/QuotationDetailPage';
import { SalesInvoicesPage } from './features/sales/SalesInvoicesPage';
import { SalesReportPage } from './features/sales/SalesReportPage';
import { SalesInvoiceDetailPage } from './features/sales/SalesInvoiceDetailPage';
import { SalesPaymentsPage } from './features/sales/SalesPaymentsPage';
import { ReportsPage } from './features/accounting/ReportsPage';
import { PartnersPage } from './features/partners/PartnersPage';
import { UsersRolesPage } from './features/users-roles/UsersRolesPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { PurchasingPage } from './features/purchasing/PurchasingPage';
import { TreasuryTransactionsPage } from './features/treasury/TreasuryTransactionsPage';
import { ExpensesPage } from './features/treasury/ExpensesPage';
import { InstallmentsPage } from './features/installments/InstallmentsPage';
import { InstallmentPlanDetailPage } from './features/installments/InstallmentPlanDetailPage';
import { InstallmentsReportsPage } from './features/installments/InstallmentsReportsPage';
import { EmployeesPage } from './features/hr/EmployeesPage';
import { PayrollPage } from './features/hr/PayrollPage';
import { PayrollRunDetailPage } from './features/hr/PayrollRunDetailPage';

export const router = createBrowserRouter([
  {
    // One shared crash boundary for the whole app — see RouteErrorBoundary for why this exists
    // (e.g. a "Failed to execute 'insertBefore' on 'Node'" crash from a translation extension
    // fighting React over the DOM) rather than a blank/broken screen with no way back.
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/select-company', element: <CompanySelectPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <Navigate to="/dashboard" replace /> },
              { path: '/dashboard', element: <DashboardPage /> },
              {
                path: '/customers',
                element: (
                  <RequirePermission code="customers.view">
                    <RequireNotPrintingPress>
                      <CustomersPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/customers/:id/statement',
                element: (
                  <RequirePermission code="customers.view">
                    <RequireNotPrintingPress>
                      <CustomerStatementPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/outstanding-balances',
                element: (
                  <RequirePermission code="customers.view">
                    <RequireNotPrintingPress>
                      <OutstandingBalancesPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/outstanding-balances/:id',
                element: (
                  <RequirePermission code="customers.view">
                    <RequireNotPrintingPress>
                      <OutstandingBalanceDetailsPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/customers/:id/outstanding-balance',
                element: (
                  <RequirePermission code="customers.view">
                    <RequireNotPrintingPress>
                      <OutstandingBalanceDetailPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/suppliers',
                element: <RequirePermission code="suppliers.view"><SuppliersPage /></RequirePermission>,
              },
              {
                path: '/suppliers/shipments/:id',
                element: <RequirePermission code="suppliers.view"><ShipmentDetailPage /></RequirePermission>,
              },
              {
                path: '/suppliers/:id/statement',
                element: <RequirePermission code="suppliers.view"><SupplierStatementPage /></RequirePermission>,
              },
              {
                path: '/sales-representatives',
                element: (
                  <RequirePermission anyOf={['sales-representatives.view', 'dashboard.view']}>
                    <SalesRepresentativesPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/inventory/products',
                element: (
                  <RequirePermission code="inventory.product.view">
                    <RequireNotPrintingPress>
                      <ProductsPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/inventory/warehouses',
                element: <RequirePermission code="settings.warehouse.view"><WarehousesPage /></RequirePermission>,
              },
              {
                path: '/inventory/warehouses/products/:productId',
                element: (
                  <RequirePermission code="settings.warehouse.view">
                    <ProductOverviewPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/inventory/stock-audit',
                element: (
                  <RequirePermission code="inventory.stockAudit.view">
                    <RequirePrintingPress>
                      <StockAuditPage />
                    </RequirePrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/inventory/stock-audit/:id',
                element: (
                  <RequirePermission code="inventory.stockAudit.view">
                    <RequirePrintingPress>
                      <StockAuditDetailPage />
                    </RequirePrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/inventory/stock',
                element: (
                  <RequirePermission code="inventory.stock.view">
                    <RequireNotPrintingPress redirectTo="/suppliers?tab=products">
                      <StockPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/sales/quotations',
                element: <RequirePermission code="sales.quotation.view"><QuotationsPage /></RequirePermission>,
              },
              {
                path: '/sales/quotations/:id',
                element: <RequirePermission code="sales.quotation.view"><QuotationDetailPage /></RequirePermission>,
              },
              {
                path: '/sales/products',
                element: (
                  <RequirePermission code="inventory.product.view">
                    <RequirePrintingPress>
                      <PrintingProductsPage />
                    </RequirePrintingPress>
                  </RequirePermission>
                ),
              },
              { path: '/sales/orders', element: <Navigate to="/sales/invoices" replace /> },
              {
                path: '/sales/invoices',
                element: <RequirePermission code="sales.invoice.view"><SalesInvoicesPage /></RequirePermission>,
              },
              {
                path: '/sales/invoices/:id',
                element: <RequirePermission code="sales.invoice.view"><SalesInvoiceDetailPage /></RequirePermission>,
              },
              {
                path: '/sales',
                element: <RequirePermission code="sales.invoice.view"><SalesReportPage /></RequirePermission>,
              },
              {
                path: '/sales/payments',
                // sales.paymentList.view, not sales.payment.view — see Sidebar.tsx for why the
                // standalone list page uses a separate code from the embedded payment actions.
                element: <RequirePermission code="sales.paymentList.view"><SalesPaymentsPage /></RequirePermission>,
              },
              {
                path: '/purchasing',
                element: (
                  <RequirePermission code="inventory.purchaseReceipt.view">
                    <RequireNotPrintingPress>
                      <PurchasingPage />
                    </RequireNotPrintingPress>
                  </RequirePermission>
                ),
              },
              {
                path: '/treasury/transactions',
                element: (
                  <RequirePermission code="treasury.cash-box.view">
                    <TreasuryTransactionsPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/treasury/expenses',
                element: <RequirePermission code="treasury.expense.view"><ExpensesPage /></RequirePermission>,
              },
              {
                path: '/installments',
                element: (
                  <RequirePermission code="sales.installmentPlan.view">
                    <RequireAirConditioning>
                      <InstallmentsPage />
                    </RequireAirConditioning>
                  </RequirePermission>
                ),
              },
              {
                path: '/installments/reports',
                element: (
                  <RequirePermission code="sales.installmentPlan.view">
                    <RequireAirConditioning>
                      <InstallmentsReportsPage />
                    </RequireAirConditioning>
                  </RequirePermission>
                ),
              },
              {
                path: '/installments/:id',
                element: (
                  <RequirePermission code="sales.installmentPlan.view">
                    <RequireAirConditioning>
                      <InstallmentPlanDetailPage />
                    </RequireAirConditioning>
                  </RequirePermission>
                ),
              },
              {
                path: '/hr/employees',
                element: <RequirePermission code="hr.employee.view"><EmployeesPage /></RequirePermission>,
              },
              {
                path: '/hr/payroll',
                element: <RequirePermission code="hr.payroll.view"><PayrollPage /></RequirePermission>,
              },
              {
                path: '/hr/payroll/:id',
                element: <RequirePermission code="hr.payroll.view"><PayrollRunDetailPage /></RequirePermission>,
              },
              {
                path: '/accounting/reports',
                element: <RequirePermission code="accounting.reports.view"><ReportsPage /></RequirePermission>,
              },
              {
                path: '/partners',
                element: <RequirePermission code="partners.view"><PartnersPage /></RequirePermission>,
              },
              {
                path: '/users-roles',
                element: <RequirePermission code="users.view"><UsersRolesPage /></RequirePermission>,
              },
              {
                // Not settings.warehouse.view — that code is shared with the Inventory > Warehouses
                // page, which the Manager role legitimately has. settings.company.view is a
                // Settings-only permission, so it correctly blocks Manager from the Settings page.
                path: '/settings',
                element: <RequirePermission code="settings.company.view"><SettingsPage /></RequirePermission>,
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);
