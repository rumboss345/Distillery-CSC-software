# Deploy to Render

## Quick deploy (Blueprint)

1. Push branch `cursor/step-1a-postgresql-cutover-b370` (or `main` after merge).
2. In [Render Dashboard](https://dashboard.render.com): **New → Blueprint**.
3. Connect repository `rumboss345/Distillery-CSC-software`.
4. Render reads `render.yaml` at repo root.
5. Set these **secret** environment variables when prompted:
   - `JWT_SECRET` — long random string (32+ chars)
   - `ADMIN_EMAIL` — initial admin login email
   - `ADMIN_PASSWORD` — initial admin password (8+ chars)
   - `APP_URL` — your service URL, e.g. `https://csc-distillery.onrender.com`
6. Click **Apply**. Render creates:
   - Web service (`csc-distillery`)
   - PostgreSQL database (`csc-postgres`)
7. Wait for build (`npm ci && npm run build`) and start (`npm start`).

## Manual deploy (single web service)

| Setting | Value |
|---------|-------|
| **Build Command** | `npm ci && npm run build` |
| **Start Command** | `npm start` |
| **Health Check** | `/api/health` |

### Required environment variables

| Variable | Example | Notes |
|----------|---------|-------|
| `NODE_ENV` | `production` | Set automatically on Render |
| `JWT_SECRET` | *(random)* | Required — server exits without it |
| `ADMIN_EMAIL` | `admin@yourdomain.com` | Synced on each boot |
| `ADMIN_PASSWORD` | *(strong password)* | Synced on each boot |
| `APP_URL` | `https://your-app.onrender.com` | Used for approval email links |
| `DATABASE_URL` | *(from Render Postgres)* | Internal connection string with SSL |
| `DATABASE_MODE` | `browser_local` | **Do not** set `postgres_authoritative` until cutover approved |

Render sets `PORT` automatically. The server binds `0.0.0.0:$PORT` in production.

## Post-deploy verification

1. Open `https://<your-app>/api/health` — expect `"ok": true`.
2. Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Admin → **Data Migration** — confirm health shows PostgreSQL reachable when `DATABASE_URL` is set.
4. **Do not activate cutover** until Step 1A checklist in `docs/STEP_1A.md` is complete.

## PostgreSQL SSL

Render Postgres connection strings include SSL. The server enables SSL when `sslmode=require` is present or `PGSSLMODE=require`.

## Rollback

- **App rollback:** Redeploy previous commit in Render dashboard.
- **Database rollback:** `pg_dump` before migration; restore via Render Postgres backups.
- **Authority rollback:** Set `DATABASE_MODE=browser_local` and restore browser export.

## What is NOT stored on Render disk

Authoritative ERP inventory lives in PostgreSQL after cutover. Before cutover, production ERP data remains in each user's browser (sql.js). SQLite auth (`server/data/auth.db`) is ephemeral on Render when using PostgreSQL auth — use `DATABASE_URL` so auth lives in Postgres.
