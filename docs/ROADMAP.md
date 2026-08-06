# Roadmap: What's Built vs Scaffolded vs Not Started

This is the authoritative status list. "Built" means real database ↔ API ↔ UI, exercised by at
least the manual smoke test in [TESTING.md](TESTING.md). "Scaffolded" means the database schema
exists and there's a basic CRUD API, but no workflow/business logic or full UI. "Not started"
means schema only, or nothing at all.

## Built (fully functional this pass)

| Module | Backend | Frontend |
|---|---|---|
| Auth (login/refresh/logout/change-password, account lockout) | ✅ | ✅ |
| RBAC (users, roles, permission catalogue) | ✅ | ✅ (basic — no permission-matrix editor UI yet, see below) |
| Audit log | ✅ (auto-captured + query API) | ❌ (no viewer page yet) |
| Settings (company, branches, warehouses, currencies + rates, taxes, fiscal years, numbering series, categories, brands, units) | ✅ | ✅ (tabbed simple CRUD) |
| Dashboard (KPIs, sales chart, top products, recent transactions) | ✅ | ✅ |
| Chart of Accounts | ✅ | ✅ |
| Journal entries (manual + automatic posting engine + reversal) | ✅ | ✅ |
| Financial reports (trial balance, balance sheet, income statement, general ledger) | ✅ | ✅ (general ledger has an API but no dedicated page yet — reachable via API/Swagger) |
| Customers & Suppliers (CRUD + account statement) | ✅ | ✅ |
| Inventory (products, weighted-average valuation, stock levels, movements ledger, adjustments, transfers) | ✅ | ✅ |
| Sales (quotation → sales order → sales invoice → payment, auto GL + stock posting) | ✅ | ✅ |

## Scaffolded (schema + basic CRUD API + placeholder or partial UI)

| Module | What exists | What's missing |
|---|---|---|
| Purchasing (requests, orders, goods receipt, invoices, payments, supplier returns) | Full DB schema; CRUD API for requests/orders/invoices/payments | Approval workflow, goods-receipt-to-stock wiring, GL posting, UI beyond a placeholder page |
| Treasury (cash boxes, bank accounts, cash transactions, transfers) | Full DB schema; CRUD API for cash boxes/bank accounts | Wiring `sales_payments`/`purchase_payments` to actually move a cash box/bank balance; cash closing/opening workflow; UI |
| Sales representatives | Entity + CRUD API | Targets/commission calculation, performance reports, daily visit tracking, UI |
| Notifications | Pull-based aggregation API (low stock, expired product, overdue invoice, repeated failed logins) | Push delivery (email/SMS/WhatsApp), a notifications UI panel (currently API-only) |

## Not started

- **POS screen** — a dedicated point-of-sale UI; today the Sales Invoice form covers the same
  data model but isn't optimized for a cashier workflow (barcode-scan-first, keyboard-driven).
- **Barcode/label printing, QR codes** — `products.barcode` exists as a field; no label rendering.
- **Batch/serial/expiry tracking UI** — `product_batches` table exists with the right columns
  (batch number, serial number, expiry date), but no UI reads/writes it yet; sales/purchasing
  currently operate at the product level only (weighted-average, not batch-specific).
- **FIFO costing** — the plan mentioned FIFO as an option; only weighted-average is implemented.
  `ValuationMethod` enum has a `FIFO` value reserved for this.
- **Email/SMS/WhatsApp integrations** — no provider wired up.
- **Two-factor authentication** — column exists, no TOTP flow.
- **Excel/CSV/PDF import-export, print layouts (invoices/labels/reports)** — not built; the API
  returns JSON only.
- **Approval workflows** (purchase order approval, expense approval, etc.) beyond the
  `approve`/`cancel` permission actions already modeled on journal entries and quotations.
- **Scheduled backups, scheduled reports** — no scheduler; use standard `pg_dump` in the meantime.
- **Depreciation / fixed assets** — `AccountType` distinguishes asset/liability/equity/revenue/
  expense, but there's no fixed-asset register or depreciation schedule.
- **Cash flow statement** — trial balance / balance sheet / income statement / general ledger are
  implemented; a proper indirect-method cash flow statement is not.
- **Company switcher UI** — the schema supports multi-company; the frontend doesn't yet expose
  switching between companies for a user assigned to more than one.
- **Global/advanced search, saved filters** — each module has local search in its list view; there
  is no cross-module global search.

## Suggested build order for the next pass

1. Wire Purchasing → Treasury → GL (mirrors the Sales → Inventory → GL pattern already built —
   `PurchaseInvoicesService` should look almost exactly like `SalesInvoicesService`).
2. Batch/expiry UI on top of the existing `product_batches` table (the hard part — the schema —
   is already done).
3. Permission-matrix editor in Users & Roles (checkbox grid over the existing
   `/roles/permissions` endpoint).
4. E2E test suite (see TESTING.md) before adding more surface area, so regressions are caught
   automatically as Purchasing gains real logic.
