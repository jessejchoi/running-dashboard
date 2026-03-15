-- migration_004.sql
-- Add challenge_type and config columns to group_challenges
-- Run manually in Supabase SQL editor

alter table group_challenges
  add column if not exists challenge_type text not null default 'group_distance',
  add column if not exists config jsonb not null default '{}'::jsonb;

alter table group_challenges alter column target_meters drop not null;
