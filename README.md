# Distillery Traker3

Production management software for distilleries. Track the full spirit-making pipeline from mash to bottle.

## Features

- **Mash & Fermentation** — Record wash batches, Brix readings, and daily fermentation logs
- **Distillation** — Log still runs with heads / hearts / tails cuts, volumes, and ABV
- **Blending** — Create blend products from holding tank spirit
- **Barrel Aging** — Track fill dates, warehouse locations, and volume loss
- **Bottling** — Record finished goods with bottle counts and lot numbers
- **Floor Plan** — Interactive equipment layout
- **Inventory** — Grains, yeast, barrels, bottles, and labels
- **Reports** — Yield analysis and production summary

## Local development

```bash
npm install
cp .env.example .env   # edit JWT_SECRET and ADMIN_PASSWORD
npm run dev
```

Open **http://localhost:5173** — Vite serves the frontend and proxies `/api` to the auth server on port 3001.

## Production (Render)

**Build Command:** `npm install && npm run build`

**Start Command:** `npm start`

Set these environment variables in the Render dashboard (not in GitHub):

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | Long random string for session tokens |
| `ADMIN_EMAIL` | Yes | Admin login email |
| `ADMIN_PASSWORD` | Yes | Admin login password |
| `APP_URL` | Yes | Your Render URL, e.g. `https://distillery-traker3.onrender.com` |
| `SMTP_*` | No | Optional email for user approval notifications |

Render sets `PORT` and `NODE_ENV=production` automatically. The Node server serves the built frontend from `dist/` and handles `/api` routes on the same port.

## Sign in & user access

On first run, an admin account is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

New users can **Request access** from the login page. Their account stays **pending** until an admin approves via email link or the **User approvals** page.

## Data storage

See deployment notes below — auth users and production data use different storage.

## License

MIT
