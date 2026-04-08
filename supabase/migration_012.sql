-- migration_012.sql
-- Add status_tag to user_profiles for group member status feature

alter table user_profiles
  add column if not exists status_tag text;
