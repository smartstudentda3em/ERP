# Architecture

## Overview

```
┌─────────────────┐      HTTPS/REST      ┌──────────────────────┐        ┌────────────┐
│  React SPA       │ ───────────────────▶ │  NestJS API (Nest)    │ ─────▶ │ PostgreSQL │
│  (Vite, Tailwind) │ ◀─────────────────── │  Clean Architecture   │ ◀───── │            │
└─────────────────┘   JWT (access+refresh) └──────────────────────┘        └────────────┘
```

- The frontend never talks to the database directly — everything goes through the versioned
  REST API under `/api`, documented live via Swagger at `/api/docs`.
- Authentication is JWT-based: a short-lived access token (15 min default) carried in the
  `Authorization` header, and a long-lived refresh token in an httpOnly cookie, rotated on each
  refresh and tracked in the `sessions` table so it can be revoked (logout, password change).

## Backend: Clean Architecture layering

Each business domain is a **Nest module** under `backend/src/modules/<domain>`, following the same
internal layering:

```
modules/<domain>/
  entities/        TypeORM entities — the persistence layer, no business logic
  dto/             class-validator DTOs — the API's input contracts
  <domain>.controller.ts   HTTP layer: routes, guards, permission checks — delegates immediately
  <domain>.service.ts      Business logic layer — the only place allowed to touch repositories
  <domain>.module.ts       Wires the above + declares what this module exports to others
```

Cross-module dependencies happen through exported **services**, never through reaching into
another module's repositories directly — e.g. the Sales module depends on
`JournalPostingService` and `StockService` from the Accounting and Inventory modules rather than
writing to `journal_entries` or `stock_levels` itself. This is what keeps double-entry balance and
inventory valuation correct no matter which module triggers a posting.

## SOLID in practice here

- **Single Responsibility**: each service owns one aggregate (e.g. `SalesInvoicesService` only
  orchestrates invoice creation; it delegates ledger posting to `JournalPostingService` and stock
  movement to `StockService` rather than doing either itself).
- **Open/Closed**: new document types that need to post to the GL (e.g. a future Purchase Invoice)
  extend `JournalPostingService.post()` with their own line-building logic rather than modifying
  the posting engine itself.
- **Liskov / Interface segregation**: `BaseCrudService<T>` (`common/services/base-crud.service.ts`)
  is used only by simple master-data services (companies, taxes, units, ...); anything with real
  business rules (invoices, payments, stock) has its own service and does not force-fit the base
  class.
- **Dependency Inversion**: controllers and services depend on injected Nest providers
  (`@InjectRepository`, `@InjectDataSource`, other services), never construct their dependencies —
  this is what makes the unit tests in `journal-posting.service.spec.ts` possible without a
  database.

## Core engines

- **`JournalPostingService`** (`modules/accounting/journal-entries/journal-posting.service.ts`):
  the only code path allowed to write to `journal_entries` / `journal_entry_lines`. Validates
  debit == credit before writing, assigns a voucher number via `NumberingSeriesService`, and
  supports running inside a caller-supplied transaction (`manager` param) so an invoice + its GL
  entry commit or roll back together.
- **`StockService`** (`modules/inventory/stock-movements/stock.service.ts`): the only code path
  allowed to write to `stock_levels` / `stock_movements`. Implements weighted-average costing —
  `receive()` recomputes the average cost, `issue()` reads it back for COGS and throws if stock is
  insufficient. Same "pass a manager to join a transaction" pattern as the posting service.

## Frontend structure

```
frontend/src/
  components/ui/       Design-system primitives (Button, Card, DataTable, Modal, Input, Badge)
  components/layout/   Sidebar, Topbar, Breadcrumbs, AppLayout
  components/auth/     Auth bootstrap + route guard
  features/<domain>/   One folder per module — pages + module-specific components
  store/               Zustand stores (auth session, theme)
  lib/                 Axios client (with refresh-token interceptor), React Query client
  i18n/                en.json / ar.json + RTL/LTR toggle
```

State is split between **TanStack Query** (server state — anything from the API, cached and
invalidated per query key) and **Zustand** (small bits of client-only state: the current JWT/user,
theme). There is no Redux-style global store because most state genuinely belongs to the server.

## Multi-tenancy model

`companies` → `branches` → `warehouses` is the tenancy hierarchy. Every transactional table carries
`companyId` (and `branchId` where relevant) so a single deployment can serve multiple companies;
the current build seeds one demo company and does not yet expose a company switcher in the UI —
switching companies today means logging in as a user assigned to that company.
