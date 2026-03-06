-- Run this in Supabase SQL Editor to add new columns

alter table activities
  add column if not exists laps jsonb,
  add column if not exists run_type text,  -- 'interval' | 'threshold' | 'long' | 'easy' | 'recovery'
  add column if not exists detail_synced boolean default false;
