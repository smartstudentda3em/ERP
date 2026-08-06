# Installation Guide

## Option A — Docker Compose (recommended)

Requires Docker + Docker Compose.

```bash
docker-compose up --build
```

This starts:

- `postgres` on `5432` (data persisted in a named volume)
- `backend` on `3000` — on startup it runs `schema:sync` (creates all tables from entities),
  then `seed` (demo company/branch/warehouse, chart of accounts, roles/permissions, admin user),
  then starts the API
- `frontend` on `5173` (built and served via nginx)

Visit http://localhost:5173. The login screen only asks for a password (hardcoded to the seeded
`admin@erp.local` account) — enter `0145`. Swagger docs at
http://localhost:3000/api/docs.

**Change the default admin password and JWT secrets before any real deployment** — see
[SECURITY.md](SECURITY.md).

## Option B — Run locally without Docker

Requires Node.js 20+ and a PostgreSQL 14+ instance you control.

### 1. Database

Create a database and user matching your `.env` (see step 2), e.g.:

```sql
CREATE USER erp_user WITH PASSWORD 'erp_password';
CREATE DATABASE erp_db OWNER erp_user;
```

### 2. Backend

```bash
cd backend
cp .env.example .env
# edit .env if your DB credentials differ from the defaults
npm install
npm run schema:sync   # creates all tables from the TypeORM entities
npm run seed           # seeds demo company, chart of accounts, roles, admin user
npm run start:dev
```

API now runs at http://localhost:3000/api (docs at `/api/docs`).

### 3. Frontend

```bash
cd frontend
cp .env.example .env   # VITE_API_BASE_URL defaults to http://localhost:3000/api
npm install
npm run dev
```

Frontend runs at http://localhost:5173 (Vite dev server proxies `/api` to `localhost:3000` — see
`vite.config.ts` — so the `.env` is only needed if you point at a non-default backend URL).

## Environment variables (backend)

| Variable | Purpose | Default |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | Postgres connection | see `.env.example` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | JWT signing secrets — **must** be changed from the default in any non-local environment | dev placeholders |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Token lifetimes | `15m` / `7d` |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:5173` |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Only used by the seed script | `admin@erp.local` / `0145` |

## Re-running the seed

The seed script is idempotent (it checks for existing rows before inserting), so `npm run seed`
can be re-run safely to pick up new permission codes after a code update.
