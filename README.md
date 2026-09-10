<<<<<<< HEAD
# Distillery Traker3

Production management software for distilleries. Track the full spirit-making pipeline from mash to bottle — all data stored locally in your browser.

## Easiest way to start

**Double-click** `Start.command` in Finder, or run:

```bash
cd ~/Projects/distillery-tracker
./start.sh
```

Then open **http://localhost:5173** in your browser.

## Features

- **Mash & Fermentation** — Record wash batches, Brix readings, and daily fermentation logs (temp, pH, Brix)
- **Distillation** — Log still runs with heads / hearts / tails cuts, volumes, and ABV
- **Barrel Aging** — Track fill dates, warehouse locations, volume loss, and aging duration
- **Bottling** — Record finished goods with bottle counts, lot numbers, and source barrels
- **Inventory** — Manage grains, yeast, barrels, bottles, and labels with low-stock alerts
- **Reports** — Yield analysis (GPA per lb grain) and production pipeline summary

## Requirements

- [Node.js](https://nodejs.org/) 18 or later (includes npm)

If Node isn't installed on macOS:

```bash
# Install Xcode Command Line Tools first (prompted automatically), then:
brew install node
# Or download from https://nodejs.org/
```

## Quick Start

```bash
cd ~/Projects/distillery-tracker
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

## Sign in & user access

The app requires login. On first run, an **admin account** is created automatically:

- **Email:** `nelson@rum.ky`
- **Password:** `rumboss` (change via `ADMIN_PASSWORD` in `.env`)

New users can **Request access** from the login page. Their account stays **pending** until you approve it:

1. **Email link** — if SMTP is configured in `.env`, nelson@rum.ky receives an approval link
2. **Admin panel** — sign in as admin → **User approvals** in the sidebar

Copy `.env.example` to `.env` and set `JWT_SECRET` plus optional SMTP settings for real email delivery. Without SMTP, approval links are printed in the auth server terminal.

```bash
cp .env.example .env
npm run dev   # starts Vite + auth API (port 3001)
```

## Data Storage

Production data is still stored in **SQLite** (via [sql.js](https://sql.js.org/)) in each user's browser localStorage. Login only controls who can open the app — it does not sync production data between users yet.

## Production Build

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── db/           # SQLite schema, persistence, and queries
├── pages/        # Dashboard, Mash, Distillation, Barrels, Bottling, Inventory, Reports
├── components/   # Layout, Modal, StatusBadge
└── types/        # TypeScript interfaces
```

## License

MIT
=======
# Distillery-CSC-software
>>>>>>> 65f8b0727542f7cb4ab5b104d9a466eb4311f21d
