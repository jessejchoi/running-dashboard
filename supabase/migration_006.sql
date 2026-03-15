-- migration_006: Support multiple sessions per day in user_plans
-- Add session_index column and update unique constraint

-- 1. Add session_index with default 0
ALTER TABLE user_plans ADD COLUMN IF NOT EXISTS session_index integer NOT NULL DEFAULT 0;

-- 2. Drop old unique constraint (athlete_id, plan_date)
ALTER TABLE user_plans DROP CONSTRAINT IF EXISTS user_plans_athlete_id_plan_date_key;

-- 3. Add new unique constraint (athlete_id, plan_date, session_index)
ALTER TABLE user_plans ADD CONSTRAINT user_plans_athlete_id_plan_date_session_index_key
  UNIQUE (athlete_id, plan_date, session_index);
