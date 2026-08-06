# ERP Accounting System — Foundation Build

A cloud-based, multi-branch, multi-warehouse, multi-currency ERP accounting system foundation, built with:

- **Backend**: Node.js + NestJS + TypeORM + PostgreSQL, JWT auth, RBAC, audit logging, Swagger docs
- **Frontend**: React + TypeScript + Vite + Tailwind CSS, dark/light theme, Arabic/English (RTL/LTR) i18n
- **Database**: Fully normalized PostgreSQL schema covering the entire ERP domain (~50 tables)

## Honest scope statement

A complete, Odoo/SAP-Business-One/Dynamics-365-class ERP is a multi-year engineering effort. This
build is a **real, working foundation**, not a hollow mockup:

- **Fully functional end-to-end** (real DB ↔ API ↔ UI, with automatic GL/stock posting where
  applicable): Authentication & RBAC, Settings (company/branch/warehouse/currency/tax/numbering/fiscal
  year), Dashboard, General Ledger (chart of accounts, journal posting engine, trial balance, balance
  sheet, income statement, general ledger), Customers & Suppliers (with account statements),
  Inventory (products, weighted-average stock valuation, adjustments, transfers), Sales (quotation →
  sales order → sales invoice → payment, auto-posting to GL and stock).
- **Scaffolded** (DB schema + basic CRUD API + placeholder UI, no approval workflow or GL wiring
  yet): Purchasing, Treasury (cash boxes/bank accounts), Sales representatives, Notifications.
- **Not built in this pass**: POS screen, barcode label printing, WhatsApp/SMS/email integrations,
  2FA, scheduled backups, Excel/PDF export, advanced approval workflows.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the authoritative module-by-module status.

## Project layout

```
backend/    NestJS REST API (Clean Architecture: modules → controllers → services → entities)
frontend/   React SPA (Vite + Tailwind, feature-folder structure)
docs/       Architecture, database, API, installation, testing, security, roadmap
docker-compose.yml   One-command local stack (Postgres + backend + frontend)
```

## Quick start

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for full instructions. Short version:

```bash
docker-compose up --build
```

Then open http://localhost:5173 — the login screen only asks for a password (hardcoded to the
seeded `admin@erp.local` account): enter `0145` (change this immediately in a real deployment).

API docs (Swagger): http://localhost:3000/api/docs

## Documentation index

- [Architecture](docs/ARCHITECTURE.md)
- [Database schema & ER diagram](docs/DATABASE.md)
- [API overview](docs/API.md)
- [Installation guide](docs/INSTALLATION.md)
- [Testing plan](docs/TESTING.md)
- [Security notes](docs/SECURITY.md)
- [Roadmap / what's built vs scaffolded](docs/ROADMAP.md)
