-- migration_016: RDCoach fact audit events

CREATE TABLE IF NOT EXISTS coach_audit_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL CHECK (scope IN ('athlete', 'group', 'run')),
  route        text NOT NULL,
  athlete_id   bigint,
  group_id     uuid REFERENCES groups(id) ON DELETE CASCADE,
  run_id       bigint,
  facts_json   jsonb NOT NULL,
  signals_json jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_audit_events_athlete_generated
  ON coach_audit_events (athlete_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS coach_audit_events_group_generated
  ON coach_audit_events (group_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS coach_audit_events_run_generated
  ON coach_audit_events (run_id, generated_at DESC);
