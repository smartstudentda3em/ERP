# Security Notes

## Authentication

- Passwords hashed with **argon2** (`argon2.hash`/`argon2.verify` in `AuthService`), never stored
  or logged in plaintext.
- JWT access tokens (15 min default) signed with `JWT_ACCESS_SECRET`; refresh tokens (7 days
  default) signed with a **separate** `JWT_REFRESH_SECRET`, delivered only via an httpOnly,
  `SameSite=Lax` cookie scoped to `/api/auth` — never exposed to frontend JS.
- Refresh tokens are additionally hashed (argon2) and stored per-session in the `sessions` table,
  so a leaked JWT refresh secret alone isn't enough to forge a session that passes the DB check;
  each refresh rotates the token and revokes the old session record.
- Failed login attempts are tracked per user (`failedLoginAttempts`); 5 consecutive failures locks
  the account for 15 minutes (`AuthService.MAX_FAILED_ATTEMPTS` / `LOCK_DURATION_MS`).
- Logout and change-password both revoke all active sessions for that user.

**Change `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to long random values before any deployment
outside local development** — the defaults in `.env.example` are placeholders, not secrets.

## Authorization (RBAC)

- Permissions are `(module, action)` pairs (`PermissionAction`: view/create/edit/delete/print/
  export/approve/cancel), matching the levels requested in the spec.
- `PermissionsGuard` + `@Permissions('module.action')` decorator enforce this per-endpoint,
  reading the permission list embedded in the user's JWT (recomputed on every login/refresh from
  their current roles — so a permission change takes effect on next token refresh, not
  instantly on already-issued tokens).
- `JwtAuthGuard` + `PermissionsGuard` + rate limiting (`ThrottlerGuard`) are registered globally
  (`APP_GUARD` in `app.module.ts`) — every endpoint is locked down by default; `@Public()` opts
  a route out (used only for `/auth/login` and `/auth/refresh`).

## Audit trail

- `AuditLogInterceptor` records every mutating request (`POST`/`PUT`/`PATCH`/`DELETE`) — actor,
  method, path, sanitized request body (passwords/tokens redacted), status code, IP, user agent,
  duration — to the `audit_logs` table, queryable via `/api/audit-logs`
  (`security.audit-log.view`).
- Financial correctness has its own audit trail: posted `journal_entries` are immutable; the only
  way to correct one is `JournalPostingService.reverse()`, which posts a reversing entry and marks
  the original `REVERSED` rather than editing it.

## Transport & headers

- `helmet()` applied globally in `main.ts` for standard security headers.
- CORS restricted to `CORS_ORIGIN` (the frontend's origin) with credentials enabled (needed for
  the refresh cookie).
- Global `ValidationPipe({ whitelist: true, transform: true })` strips unexpected fields and
  coerces types before they reach a controller — reduces mass-assignment risk.

## What's NOT implemented yet (be aware)

- **Two-factor authentication**: `users.twoFactorEnabled` column exists but there's no TOTP/SMS
  flow wired up.
- **IP/device tracking beyond the audit log**: sessions record IP/user-agent at creation, but
  there's no device-fingerprint-based anomaly detection.
- **Field-level encryption** for particularly sensitive columns (e.g. tax numbers) — currently
  relies on database-level access control and TLS in transit, not application-level encryption.
- **Backup/restore automation**: not built — use standard `pg_dump`/`pg_restore` (or your managed
  Postgres provider's snapshot feature) until a scheduler is added; see the Backup section of
  ROADMAP.md.
