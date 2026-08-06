# API Overview

Base URL: `/api`. Full interactive documentation (request/response schemas, try-it-out) is served
live by Swagger at **`/api/docs`** once the backend is running — that is the authoritative
reference. This file is a map of what exists, not a full spec.

All successful responses are wrapped as `{ "success": true, "data": ... }` by a global
interceptor; errors are `{ "success": false, "statusCode": ..., "message": ... }`.

## Auth (`/api/auth`) — public except where noted

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | body `{ email, password }`; returns access token + user, sets refresh cookie |
| POST | `/auth/refresh` | reads refresh cookie; rotates it; returns a new access token |
| POST | `/auth/logout` | requires auth; revokes the session |
| POST | `/auth/change-password` | requires auth |

## Users & RBAC

- `/api/users` — CRUD (`users.view|create|edit|delete`)
- `/api/roles`, `/api/roles/permissions` — role CRUD + full permission catalogue
  (`roles.view|create|edit|delete`)
- `/api/audit-logs` — paginated audit trail (`security.audit-log.view`)

## Settings

`/api/settings/companies`, `/branches`, `/warehouses`, `/currencies` (+`/exchange-rates`),
`/taxes`, `/fiscal-years` (+`/:id/close`), `/numbering-series`, `/product-categories`, `/brands`,
`/units` — all standard CRUD, permission codes follow `settings.<resource>.<action>`.

## Accounting

- `/api/accounting/accounts` — chart of accounts CRUD (`?companyId=`)
- `/api/accounting/journal-entries` — list/get manual+system entries, `POST` to create a manual
  entry, `POST /:id/reverse` to reverse a posted entry
- `/api/accounting/reports/trial-balance|balance-sheet|income-statement|general-ledger` —
  query-param driven (`companyId`, `dateFrom`/`dateTo` or `asOfDate`)
- `/api/accounting/cost-centers`, `/projects`, `/budgets` — CRUD

## Parties

- `/api/customers` (+`/:id/statement`), `/api/suppliers` (+`/:id/statement`) — CRUD + account
  statement (opening balance + running balance from invoices/payments)
- `/api/sales-representatives` — CRUD

## Inventory

- `/api/inventory/products` (+`/low-stock`, `/barcode/:barcode`) — CRUD
- `/api/inventory/stock/levels`, `/movements` — read the current state / ledger
- `/api/inventory/stock/adjustments`, `/transfers` — `POST` to create (adjusts stock immediately;
  no draft/approval step in this pass)

## Sales

- `/api/sales/quotations` — CRUD + `POST /:id/confirm`
- `/api/sales/orders` — create/list/get
- `/api/sales/invoices` — create (issues stock + posts GL atomically), list/get
- `/api/sales/payments` — create (posts GL, updates invoice paid status), list

## Dashboard & Notifications

- `/api/dashboard/summary`, `/charts/sales`, `/charts/purchases`, `/top-selling-products`,
  `/expired-products`, `/recent-transactions`
- `/api/notifications` — pull-based aggregation (low stock, expired products, overdue invoices,
  repeated failed logins)

## Scaffolded (schema + basic CRUD only, see docs/ROADMAP.md)

`/api/purchasing/requests|orders|invoices|payments`, `/api/treasury/cash-boxes|bank-accounts`.

## Authentication for API calls

Send `Authorization: Bearer <accessToken>` on every request except `/auth/login` and
`/auth/refresh`. Access tokens expire in 15 minutes by default; the frontend's Axios client
handles silent refresh automatically — a direct API consumer should call `/auth/refresh` (with the
httpOnly cookie) on a 401 and retry once.
