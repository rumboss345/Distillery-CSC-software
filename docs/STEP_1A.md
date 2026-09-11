# Step 1A — Central PostgreSQL Migration, Validation & Controlled Cutover

## Overview

Step 1A prepares CSC Distillery ERP for multi-user production on PostgreSQL while **preserving browser-local mode** until an administrator explicitly activates cutover.

## Database Modes (`DATABASE_MODE`)

| Mode | Behavior |
|------|----------|
| `browser_local` (default) | Browser sql.js is authoritative. PostgreSQL optional for migration prep. |
| `dual_validation` | Browser authoritative; relevant server operations logged to `erp_dual_validation_log` for comparison. |
| `postgres_authoritative` | All ERP writes must go through `/api/erp/*`. Browser local writes blocked. |

**Do not set `postgres_authoritative` until validation passes and cutover is approved.**

## Migration Workflow

1. **Configure PostgreSQL** — set `DATABASE_URL` (Render Postgres or `docker-compose up -d`).
2. **Start server** — migrations 001–021 apply automatically on boot.
3. **Export browser database** — Admin → Data Migration → download external backup.
4. **Preview import** — `POST /api/production/migration/preview`
5. **Import** — `POST /api/production/migration/import` (legacy 003 + ERP 005–020 tables)
6. **Validate** — `POST /api/production/migration/validate`
7. **Review reconciliation** — `erp_reconciliation_runs` table / import validation summary
8. **Confirm API readiness** — health shows `serverApiCutoverReady=true` when migrations + ERP API domains pass
9. **Activate cutover** (admin only, requires validation pass) — `POST /api/production/migration/activate`

## Backup & Rollback

### Before migration
- Download browser export (base64) to external storage
- `pg_dump $DATABASE_URL > pre_cutover_backup.sql`

### Rollback to browser-local
1. Set `DATABASE_MODE=browser_local`
2. Remove or unset cutover: update `app_settings.production_migration_state` to `MIGRATION_IMPORTED` or `MIGRATION_READY` (admin SQL)
3. Restart server — browser sql.js resumes authority
4. Restore browser DB from external export if needed

### Prevent writes during final window
- Set maintenance banner / stop users before activate
- Do not activate until reconciliation passes

## Server ERP API

Authenticated routes under `/api/erp/`:

- `material`, `liquid`, `finished-goods`, `sales`, `quality`
- `warehouse`, `barrel`, `production`, `costing`, `accounting`, `reporting`, `admin`

Permissions enforced server-side via `adm_erp_users` and Phase 1P role matrix.

## Health Endpoint

`GET /api/health` reports:

- `databaseMode`, `schemaVersion`, `reconciliationStatus`
- `production.serverApiCutoverReady`
- `production.serverAuthoritative` (false until activate)
- `apiDomainsReady`

## Render Deployment

Required env vars:
- `DATABASE_URL` (with SSL for Render)
- `JWT_SECRET`
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- `NODE_ENV=production`
- `DATABASE_MODE=browser_local` until cutover approved

Connection pooling via `pg.Pool` (max 10). No authoritative data on ephemeral filesystem.

## Client Data Adapter (Step 1A-F)

When `DATABASE_MODE=postgres_authoritative`:

- `ErpDataProvider` bootstraps `/api/erp/bootstrap` into an in-memory cache
- `hydrateErpTablesFromServerCache()` repopulates the sql.js query engine from server data (not localStorage ERP rows)
- `tryServerWrite()` routes critical ledger mutations to `/api/erp/*` handlers
- `persistDb()` skips localStorage writes — stale browser ERP data cannot appear as production inventory

Modules: `src/data/data-adapter.ts`, `server-api-adapter.ts`, `server-cache-hydrator.ts`, `server-mutation-bridge.ts`

## Cutover Dry Run (TEST database)

1. Create browser-local test dataset in `browser_local` mode
2. Export via Admin → Data Migration
3. `pg_dump $DATABASE_URL > pre_cutover_backup.sql`
4. `POST /api/production/migration/import`
5. `POST /api/production/migration/validate` — reconciliation must PASS (all lots, tanks, COGS)
6. Set `DATABASE_MODE=postgres_authoritative` on **test** server only
7. Run operational workflow (receipt → production → ship)
8. Restart server — confirm data persists
9. Re-run reconciliation — must PASS
10. Roll back: `DATABASE_MODE=browser_local`, restore browser export if needed

## Render Production Configuration

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Render PostgreSQL with SSL (`?sslmode=require`) |
| `DATABASE_MODE` | Yes | `browser_local` until cutover approved |
| `JWT_SECRET` | Yes | Strong random secret |
| `ADMIN_EMAIL` | Yes | Initial admin login |
| `ADMIN_PASSWORD` | Yes | Initial admin password |
| `NODE_ENV` | Yes | `production` |

Startup: migrations 001–021 apply automatically. Connection pool max 10. No authoritative data on ephemeral filesystem.

## Cutover Readiness (`serverApiCutoverReady`)

`evaluateCutoverReadiness()` returns `ready=true` only when ALL checks pass:

- PostgreSQL connected
- Migrations current (001–021)
- Read + critical write domains IMPLEMENTED
- Last reconciliation PASS with zero discrepancies
- Integration certification recorded (`step_1a_integration_certified`)
- Client adapter + server-mode paths certified
- NOT prematurely in `postgres_authoritative` production mode

**`serverApiCutoverReady` remains false until every gate passes.**

## Cutover Checklist (Human Approval Required)

- [ ] All tests pass (unit + PostgreSQL integration)
- [ ] Import + full reconciliation PASS (no sampling on critical ledger data)
- [ ] `serverApiCutoverReady=true`
- [ ] Concurrency scenarios A–F verified on PostgreSQL
- [ ] E2E workflow test passes on PostgreSQL
- [ ] UI smoke test in `postgres_authoritative` against TEST database
- [ ] Multi-user test (2 sessions, shared state)
- [ ] Cutover dry run documented
- [ ] External browser backup stored
- [ ] PostgreSQL backup taken
- [ ] Admin activates via Data Migration UI
- [ ] Only then: set `DATABASE_MODE=postgres_authoritative` in production

**Do not enable `SERVER_AUTHORITATIVE` without explicit approval.**
