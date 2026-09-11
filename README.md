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
| `DATABASE_URL` | Yes — attach a Render PostgreSQL instance |
| `JWT_SECRET` | Yes |
| `ADMIN_EMAIL` | Yes |
| `ADMIN_PASSWORD` | Yes |
| `APP_URL` | Yes — your Render URL |

The admin account is created or updated automatically on each server start from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Render sets `PORT` and `NODE_ENV=production` automatically. The Node server serves the built frontend from `dist/`, handles `/api` auth routes, and stores production data in PostgreSQL.

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

**Authoritative production data** lives in **PostgreSQL** on the server (batches, inventory, tanks, etc.).

Browser **localStorage** may still hold a legacy sql.js copy until migrated via **Admin → Data migration**. After import, the server database is the source of truth.

Liquid volumes are stored internally in **litres (L)**. ABV is stored as a percentage (0–100).

## License

MIT
