-- migration_010: AI features overhaul
-- Run in Supabase SQL editor

-- Weekly awards persisted from RDCoach briefings
CREATE TABLE IF NOT EXISTS group_member_awards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  athlete_id    bigint NOT NULL,
  award_key     text NOT NULL,
  award_label   text NOT NULL,
  week_start    date NOT NULL,
  caption       text,
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS group_member_awards_group_athlete ON group_member_awards (group_id, athlete_id);
CREATE INDEX IF NOT EXISTS group_member_awards_group_week    ON group_member_awards (group_id, week_start DESC);
CREATE UNIQUE INDEX IF NOT EXISTS group_member_awards_unique ON group_member_awards (group_id, athlete_id, award_key, week_start);

-- Add perceived effort and athlete note to run coach notes
ALTER TABLE run_coach_notes
  ADD COLUMN IF NOT EXISTS perceived_effort text,
  ADD COLUMN IF NOT EXISTS athlete_note     text;

-- Cache for personal pattern insight cards
CREATE TABLE IF NOT EXISTS athlete_insight_cache (
  athlete_id   bigint PRIMARY KEY,
  content      text NOT NULL,
  generated_at timestamptz NOT NULL
);

-- Add peek cache columns to group_coach_briefings
ALTER TABLE group_coach_briefings
  ADD COLUMN IF NOT EXISTS peek_cache_json   jsonb,
  ADD COLUMN IF NOT EXISTS peek_generated_at timestamptz;
