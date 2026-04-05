-- migration_011.sql
-- Add created_by_coach flag to group_challenges
-- Run manually in Supabase SQL editor

alter table group_challenges
  add column if not exists created_by_coach boolean not null default false;
