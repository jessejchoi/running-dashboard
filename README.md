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
3. Paste and run the contents of `supabase/schema.sql`
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
| `/goals` | Race goal tracker: progress bars and training notes for each goal |
| `/runs` | Full activity log table with pace, HR, elevation, suffer score |

---

## Your Race Goals (pre-configured)
- **Sub 22:30 5K** — Mid April 2026 (4:30/km)
- **Sub 45:00 10K** — Mid July 2026 (4:30/km)
- **Sub 1:45 Half Marathon** — End October 2026 (4:58/km)

To change race dates or targets, edit `lib/utils.ts` → `RACE_GOALS`.

---

## Tech Stack
- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — Postgres database + token storage
- **Recharts** — charts
- **Tailwind CSS** — styling
- **date-fns** — date utilities
