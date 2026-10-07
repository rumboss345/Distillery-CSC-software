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

The admin account is created or updated automatically on each server start from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Render sets `PORT` and `NODE_ENV=production` automatically. Pin Node **20** (`NODE_VERSION=20` in `render.yaml`) so native `better-sqlite3` auth DB modules match the runtime. The Node server serves the built frontend from `dist/` and handles `/api` auth routes.

`render.yaml` mounts a persistent disk at `/var/data` and sets `DATA_DIR=/var/data`. That disk holds both the login database and the shared distillery record. A service created before this disk existed needs the disk added in the Render dashboard; without it, a redeploy erases the shared record and the user accounts. The admin account is recreated from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on startup.

Optional: run `npm run reset-admin` locally to update the admin password without restarting.

**Test employees:** run `npm run seed:test-employees` while the auth server has been started at least once (creates `server/data/auth.db`). This adds four approved users (`maria.santos@csc.test`, `james.cobb@csc.test`, `elena.park@csc.test`, `chris.dalton@csc.test`) for assignee dropdowns and login tests. Default password `TestEmployee1!` (override with `TEST_EMPLOYEE_PASSWORD`).

## Data storage

Everyone who is signed in shares **one** distillery record on the server (`distillery.sqlite` in `DATA_DIR`, or `server/data` when `DATA_DIR` is unset). Washes, runs, tanks, recipes, inventory, barrels, and the floor plan come from that record. The browser keeps a local copy so the page can keep working if the server is briefly unreachable, then it catches up.

The first signed-in browser that connects while the server record is empty uploads its copy and that becomes the shared record. Sign in first on the computer that already has the real production records. After the server has a record, that record is what every browser shows. Two full databases are not merged. If two people save in the same moment, the later save is replaced by the one the server already kept, and the screen says so.

An admin can clear the shared record from the dashboard. That clears it for everyone. A cleared record is not refilled by another browser’s old copy.

## License

MIT
