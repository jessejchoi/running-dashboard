-- Critical-pace engine v1: caches the two foundations of the new analysis model.
--
-- 1. activity_best_efforts — per-activity max-mean pace at a fixed time grid.
--    The 3-parameter critical-pace fit (CP, D', pmax) reads from this table.
--
-- 2. activity_conditions — per-activity ambient weather + a wet-bulb-style
--    heat-stress proxy. Lets the engine produce both "today" and
--    "ideal-conditions" race times.
--
-- Both are write-once-at-ingest, read-many. Indexed for rolling-window queries
-- by athlete + duration + date.

create table if not exists activity_best_efforts (
  activity_id          bigint not null references activities(id) on delete cascade,
  athlete_id           bigint not null,
  activity_start_date  timestamptz not null,
  duration_secs        int not null,
  best_pace_sec_per_km double precision not null,
  avg_hr               double precision,
  start_offset_sec     int,
  computed_at          timestamptz not null default now(),
  primary key (activity_id, duration_secs)
);

create index if not exists best_efforts_athlete_window_idx
  on activity_best_efforts (athlete_id, duration_secs, activity_start_date desc);

create index if not exists best_efforts_athlete_idx
  on activity_best_efforts (athlete_id);

-- Ambient conditions during each activity. One row per activity, fetched once.
-- A row exists once we've attempted a fetch; fetch_error is set when the
-- attempt failed (no GPS, indoor, API timeout) so we don't retry indefinitely.
create table if not exists activity_conditions (
  activity_id        bigint primary key references activities(id) on delete cascade,
  athlete_id         bigint not null,
  source             text not null check (source in ('open_meteo', 'strava_device', 'manual', 'unknown')),
  temp_c             double precision,
  humidity_pct       double precision,
  dewpoint_c         double precision,
  wind_kph           double precision,
  wbgt_approx_c      double precision,
  fetched_at         timestamptz not null default now(),
  fetch_error        text
);

create index if not exists conditions_athlete_idx
  on activity_conditions (athlete_id);
