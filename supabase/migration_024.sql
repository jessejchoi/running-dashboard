-- migration_024: Retire the personal run/training plan feature.
-- Run manually in the Supabase SQL editor, only AFTER the release that removes
-- the plan code is live. No deployed code reads these objects once that release
-- ships, so waiting a release before running this is safe.
-- DESTRUCTIVE: deletes every saved plan session, plan revision and training
-- preference. Repeatable.
begin;
set local lock_timeout = '10s';

-- Leaving a group still clears dormant shared-run RSVPs but no longer touches plans.
create or replace function remove_member_rsvps() returns trigger language plpgsql security definer set search_path=public as $$
begin delete from shared_run_rsvps where athlete_id=old.athlete_id and run_id in(select id from shared_runs where group_id=old.group_id);
 return null;end $$;

-- Data changes queue only estimate recomputation; plan adaptation is gone.
create or replace function queue_athlete_refresh() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' or NEW.data_version<>OLD.data_version then
 -- Archive pages may change hundreds of rows; retain only one pending calculation.
 update background_jobs set status='done',last_error='Superseded by newer input' where scope=NEW.athlete_id::text and kind='estimates' and status='queued';
 insert into background_jobs(kind,scope,input_version) values
 ('estimates',NEW.athlete_id::text,NEW.data_version||':'||(now() at time zone 'Asia/Jakarta')::date)
 on conflict(kind,scope,input_version) do nothing;
 end if;return null;
end $$;
update background_jobs set status='done',last_error='Plan adaptation retired'
 where kind='adapt' and status in('queued','running');

-- Plan writers. The shared-run functions were already unreachable (the API returns 410)
-- and write user_plans, so they go too; the dormant shared_runs tables stay.
drop function if exists rsvp_shared_run(uuid,uuid,bigint,integer,integer,boolean,boolean,boolean,bigint);
drop function if exists update_shared_run(uuid,uuid,bigint,integer,jsonb,boolean);
drop function if exists commit_plan(bigint,bigint,bigint,jsonb,uuid[],text,boolean,date);
drop function if exists save_training_preferences(bigint,bigint,jsonb);

drop table if exists plan_revisions;
drop table if exists training_preferences;
drop table if exists user_plans;

-- athlete_state.plan_version stays: group_input_version() still hashes it, and it
-- no longer changes, so it cannot invalidate cached briefings.
notify pgrst, 'reload schema';
commit;
