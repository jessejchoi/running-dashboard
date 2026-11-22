-- migration_026: Count Rhythm runs per week in the database.
-- Run in the Supabase SQL editor BEFORE deploying the release that calls it;
-- until then the Rhythm card and the Raid tab can't load. Additive and repeatable.
begin;
set local lock_timeout = '10s';

-- Qualifying runs per runner per week (Monday start), by the day each run was
-- run on the runner's own clock. Mirrors countRuns() in lib/rhythm.ts:
-- p_min_secs is MIN_RUN_SECS, passed in so the rule lives in one place.
create or replace function rhythm_week_counts(p_athletes bigint[], p_from date, p_min_secs integer)
returns table(athlete_id bigint, week_start date, runs integer)
language sql stable security definer set search_path=public as $$
 select a.athlete_id, date_trunc('week', a.start_date_local)::date, count(*)::integer
 from activities a
 where a.athlete_id = any(p_athletes) and a.type = 'Run' and a.moving_time >= p_min_secs
   and a.start_date_local >= p_from
 group by 1, 2
 order by 1, 2;
$$;
revoke all on function rhythm_week_counts(bigint[], date, integer) from public, anon, authenticated;
grant execute on function rhythm_week_counts(bigint[], date, integer) to service_role;

commit;
