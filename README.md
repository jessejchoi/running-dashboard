# RunDash — Personal Running Dashboard

A Next.js dashboard connected to Strava. Tracks weekly mileage, pace trends, and progress toward your race goals.

---

## Setup Guide

### 1. Strava App
1. Go to https://www.strava.com/settings/api
2. Create an app (name it anything, e.g. "My Run Dashboard")
3. Set **Authorization Callback Domain** to `localhost`
4. Save your **Client ID** and **Client Secret**

### 2. Supabase Database
1. Go to https://supabase.com and create a free account + new project
2. In your project, go to **SQL Editor**
3. Paste and run `supabase/schema.sql`, then the numbered migrations in order. Existing installations apply `supabase/migration_021.sql` before deploying this release. See [rollout notes](docs/expansion-rollout.md).
4. Go to **Project Settings > API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 3. Local Setup
```bash
# Clone / unzip the project, then:
cd running-dashboard
npm install

# Copy the env file and fill it in
cp .env.example .env.local
# Edit .env.local with your Strava and Supabase credentials

# Run locally
npm run dev
# Open http://localhost:3000
```

### 4. Connect Strava
- Open http://localhost:3000
- Click **Connect with Strava**
- Authorize the app
- Your activities will start syncing automatically

---

## Deploy to Vercel

```bash
npm install -g vercel
vercel
```

After deploying:
1. In Vercel dashboard → Settings → Environment Variables, add all vars from `.env.example`
2. Set `NEXT_PUBLIC_APP_URL` to your Vercel URL (e.g. `https://my-run-dash.vercel.app`)
3. Go back to https://www.strava.com/settings/api and update **Authorization Callback Domain** to your Vercel domain (e.g. `my-run-dash.vercel.app`)

---

## Pages

| Route | Description |
|---|---|
| `/` | Dashboard: stats, weekly mileage chart, pace trend, goals preview, recent runs |
| `/goals` | Saved race events, actual results, credible target gaps and recurring training goals |
| `/runs` | 50-row activity history with date/type filters and resumable archive status |

---

## Plans and groups

Set race events on `/goals` and availability on `/plan`. Saved manual workouts remain protected. Coach plans provide seven upcoming days plus a dated progression. The estimator and automatic adaptation have independent, disabled-by-default rollout flags.

Groups retain challenges, coaching awards, and chat, and can schedule shared runs with optional personal-plan copies. Betting interfaces and handlers have been retired; their historical tables remain dormant.

## Validation

Run `npm test`, `npm run typecheck`, and `npm run build`. The PostgreSQL integration tests use an isolated PGlite database and never touch production. See [rollout and evaluation](docs/expansion-rollout.md) for migrations, model evaluation, feature gates, and operational checks.

## Tech Stack
- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — Postgres database + token storage
- **Recharts** — charts
- **Tailwind CSS** — styling
- **date-fns** — date utilities
