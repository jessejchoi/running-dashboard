-- Migration 002: Add user preferences columns to user_profiles
-- Adds unit preference, primary group, weight, and max HR fields

-- Ensure user_profiles table exists with base columns
create table if not exists user_profiles (
  athlete_id bigint primary key,
  display_name text,
  age int,
  gender text,
  created_at timestamptz default now()
);

-- Add new preference columns
alter table user_profiles
  add column if not exists unit text default 'km',
  add column if not exists primary_group_id uuid references groups(id) on delete set null,
  add column if not exists weight_kg float,
  add column if not exists max_hr int,
  add column if not exists updated_at timestamptz default now();
