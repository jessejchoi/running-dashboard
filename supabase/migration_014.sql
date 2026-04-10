-- Add pace zones cache to user_profiles
-- Stores personalized pace zone boundaries derived from race results / user goals
-- Refreshed every 14 days by syncActivityDetails()

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS pace_zones jsonb,
  ADD COLUMN IF NOT EXISTS pace_zones_updated_at timestamptz;
