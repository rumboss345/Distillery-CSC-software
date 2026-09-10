# CSC Distillery Tracker

Production management software for distilleries. Track the full spirit-making pipeline from mash to bottle.

## Features

- **Mash & Fermentation** — Record wash batches, Brix readings, and daily fermentation logs
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

The admin account is created or updated automatically on each server start from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Render sets `PORT` and `NODE_ENV=production` automatically. The Node server serves the built frontend from `dist/` and handles `/api` auth routes.

Optional: run `npm run reset-admin` locally to update the admin password without restarting.

## Data storage

Production data is stored in **SQLite** (sql.js) in each user's browser localStorage. It is not synced to the server.

## License

MIT
