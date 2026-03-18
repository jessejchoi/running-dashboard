-- Migration 009: RDCoach v2 Phase 1 tables

CREATE TABLE IF NOT EXISTS coach_conversations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_id bigint NOT NULL,
  group_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coach_conv_athlete_group ON coach_conversations(athlete_id, group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS run_coach_notes (
  run_id bigint PRIMARY KEY,
  athlete_id bigint NOT NULL,
  content text NOT NULL,
  generated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS athlete_workout_cache (
  athlete_id bigint PRIMARY KEY,
  content jsonb NOT NULL,
  generated_at timestamptz DEFAULT now()
);
