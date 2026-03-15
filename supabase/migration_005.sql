-- migration_005.sql
-- User training plans (shared in groups)
-- Run manually in Supabase SQL editor

create table if not exists user_plans (
  id uuid default gen_random_uuid() primary key,
  athlete_id bigint not null,
  plan_date date not null,
  session_type text,
  description text,
  target_distance_meters numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(athlete_id, plan_date)
);

create index if not exists user_plans_athlete_date on user_plans(athlete_id, plan_date);
