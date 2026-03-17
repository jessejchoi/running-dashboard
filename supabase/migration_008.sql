-- Migration 008: Race detection columns on activities
-- Run in Supabase SQL editor

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS is_race boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_distance_key text;

-- Index for quick race queries
CREATE INDEX IF NOT EXISTS idx_activities_is_race ON activities (athlete_id, is_race) WHERE is_race = true;
