-- Run this in your Supabase SQL editor (supabase.com > SQL Editor)

-- Stores the Strava OAuth tokens
create table if not exists strava_tokens (
  id uuid primary key default gen_random_uuid(),
  athlete_id bigint unique not null,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  athlete_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Stores all synced activities
create table if not exists activities (
  id bigint primary key, -- Strava activity ID
  athlete_id bigint not null,
  name text,
  type text,
  start_date timestamptz,
  distance float,           -- meters
  moving_time int,          -- seconds
  elapsed_time int,         -- seconds
  total_elevation_gain float,
  average_speed float,      -- m/s
  max_speed float,
  average_heartrate float,
  max_heartrate float,
  average_cadence float,
  suffer_score int,
  splits jsonb,             -- per-km splits
  raw jsonb,                -- full strava payload
  created_at timestamptz default now()
);

create index if not exists activities_athlete_id_idx on activities(athlete_id);
create index if not exists activities_start_date_idx on activities(start_date desc);
create index if not exists activities_type_idx on activities(type);
