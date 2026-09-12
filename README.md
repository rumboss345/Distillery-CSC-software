# CSC Distillery Tracker

Production management software for distilleries. Track the full spirit-making pipeline from wash to bottle.

## Features

- **Wash & Fermentation** — Record wash batches, Brix readings, and daily fermentation logs
- **Distillation** — Log still runs with heads / hearts / tails cuts, volumes, and ABV
- **Blending** — Create blend products from holding tank spirit
- **Barrel Aging** — Track fill dates, warehouse locations, and volume loss
- **Bottling** — Record finished goods with bottle counts and lot numbers
- **Floor Plan** — Interactive equipment layout
- **Inventory** — Sugar, yeast, barrels, bottles, and labels
- **Reports** — Yield analysis and production summary

## Local development

```bash
npm install
cp .env.example .env   # set ADMIN_EMAIL, ADMIN_PASSWORD, JWT_SECRET
npm run dev
```

Open **http://localhost:5173** and sign in.

## Production (Render)

**Build Command:** `npm install && npm run build`

**Start Command:** `npm start`

Set in the Render dashboard (not GitHub):

| Variable | Required |
|----------|----------|
| `JWT_SECRET` | Yes |
| `ADMIN_EMAIL` | Yes |
| `ADMIN_PASSWORD` | Yes |
| `APP_URL` | Yes — your Render URL |
| `DATABASE_URL` | Optional during testing — omit to use browser-local production data |

The admin account is created or updated automatically on each server start from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Render sets `PORT` and `NODE_ENV=production` automatically. The Node server serves the built frontend from `dist/` and handles `/api` auth routes. Without `DATABASE_URL`, auth uses local SQLite and production data stays in the browser until you enable PostgreSQL migration.

Optional: run `npm run reset-admin` locally to update the admin password without restarting.

### Local PostgreSQL

```bash
docker compose up -d
cp .env.example .env   # set DATABASE_URL
npm run dev
```

### Migrating browser data to the server

1. Sign in as admin → **Data migration**
2. **Download Browser Backup** (always do this first)
3. **Preview Import** → review record counts
4. **Import to Server** with explicit confirmation

The server never auto-imports or merges multiple browser databases silently.

## Data storage

Until an administrator completes cutover, **browser localStorage (sql.js) is the authoritative production database**. PostgreSQL holds an imported copy for validation; import alone does not switch authority.

After **Activate Central Database** (requires Step 1A API), PostgreSQL becomes authoritative and browser production writes are disabled.

Liquid volumes are stored in **litres (L)** on the server. ABV is stored as a percentage (0–100).

## License

MIT
