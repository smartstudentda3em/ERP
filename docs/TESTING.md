# Testing Plan

## What's automated today

```bash
cd backend
npm test
```

Runs (no database required — these are pure unit tests against isolated logic):

- `common/utils/pricing.spec.ts` — line/document total calculations (discount-before-tax,
  multi-line aggregation)
- `modules/accounting/journal-entries/journal-posting.service.spec.ts` — the double-entry
  posting engine: rejects fewer than two lines, rejects unbalanced debit/credit, rejects a line
  with both debit and credit set, and confirms a balanced entry posts with a voucher number

An e2e test scaffold exists (`backend/test/jest-e2e.json`, `npm run test:e2e`) but no test cases
are implemented yet — see "What's not verified" below.

## Manual smoke test (do this before considering a deploy "working")

This exercises the golden path across modules end-to-end:

1. `docker-compose up --build`, wait for backend to log `ERP backend listening on ...`
2. Open http://localhost:5173, enter the admin password `0145` (login is simplified to a
   single password field, hardcoded to the seeded `admin@erp.local` account)
3. **Dashboard** loads without errors (KPI cards show `0`/`—` on a fresh DB — expected)
4. **Settings → Units/Product Categories/Brands**: confirm the seeded rows appear
5. **Inventory → Products**: create a product (pick the seeded "Piece" unit)
6. **Customers**: create a customer
7. **Sales → Sales Invoices**: create an invoice for that customer/product/warehouse
   - Confirm it succeeds (this exercises: stock issue → weighted-average cost lookup →
     insufficient-stock check → GL posting, all in one transaction)
   - If you didn't create opening stock first, this should fail with an "insufficient stock"
     error — that's correct behavior, not a bug; use a Stock Adjustment first to bring in
     opening quantity
8. **Accounting → Reports → Trial Balance**: confirm the invoice's debit/credit lines appear and
   the report says "Balanced"
9. **Customers → (row) → Statement**: confirm the invoice shows as a debit and the running
   balance matches the invoice total
10. **Sales → Sales Invoices → (row) → Record Payment**: pay it off, confirm status moves to
    `PAID` and the customer statement reflects the payment
11. Toggle dark mode and switch language to Arabic (topbar) — confirm layout mirrors to RTL and
    text renders correctly

## What's NOT verified (be aware before relying on this)

This was built without access to a live PostgreSQL instance or Docker in the build environment.
That means:

- `npm run schema:sync`, `npm run seed`, and the full request/response cycle against a real
  database have **not** been executed end-to-end by the build process itself — only:
  - Backend: `npm run build` (TypeScript compiles cleanly, all Nest module wiring resolves)
  - Frontend: `tsc -b && vite build` (compiles and bundles cleanly)
  - Unit tests above (pass, but they mock the database layer)
- Run the manual smoke test above yourself after `docker-compose up` before treating this as
  verified working software.

## Recommended next testing investment

- E2E suite (`test/jest-e2e.json` is scaffolded): login → create customer → create product →
  stock adjustment (opening stock) → create sales invoice → assert GL trial balance reflects it →
  record payment → assert invoice status. This is the single highest-value test to add next,
  since it exercises the transactional posting logic against a real database.
- Contract tests for the Purchasing/Treasury scaffolded endpoints once they grow real logic.
- Frontend component tests (none exist yet — Vitest + React Testing Library would fit the Vite
  setup already in place).
