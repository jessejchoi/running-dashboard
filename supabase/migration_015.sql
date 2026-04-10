-- migration_015.sql
-- Single source of truth for each athlete's latest race estimates.
-- Updated on every Strava sync that produces new runs, and on run recategorization.
-- All pages (dashboard, analysis, group goals) read from here instead of
-- running live analysis or querying estimate_snapshots.

CREATE TABLE IF NOT EXISTS user_latest_estimates (
  athlete_id   bigint PRIMARY KEY,
  secs_5k      int,
  secs_10k     int,
  secs_hm      int,
  secs_fm      int,
  updated_at   timestamptz DEFAULT now() NOT NULL
);
