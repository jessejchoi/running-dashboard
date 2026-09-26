-- Per-runner time zones. Each activity keeps the wall-clock start time and zone
-- Strava recorded where it was run; each profile tracks the zone of its latest
-- activity. Day, week and challenge bucketing use the run's own local date.
begin;
set local lock_timeout = '10s';

alter table activities add column if not exists start_date_local timestamp;
alter table activities add column if not exists timezone text;
alter table user_profiles add column if not exists timezone text;

-- "(GMT-08:00) America/Los_Angeles" -> 'America/Los_Angeles'; null when unknown.
create or replace function strava_zone(label text) returns text language plpgsql stable as $$
declare z text := substring(label from '\)\s*(\S+)\s*$');
begin
  if z is null then return null; end if;
  perform now() at time zone z;
  return z;
exception when others then return null;
end $$;

create or replace function set_activity_local_time() returns trigger language plpgsql as $$
begin
  NEW.timezone := coalesce(strava_zone(NEW.raw->>'timezone'), NEW.timezone);
  -- A timestamp without time zone ignores Strava's misleading trailing "Z".
  NEW.start_date_local := coalesce(
    (NEW.raw->>'start_date_local')::timestamp,
    NEW.start_date at time zone coalesce(NEW.timezone, 'UTC'));
  return NEW;
end $$;
drop trigger if exists activity_local_time on activities;
create trigger activity_local_time before insert or update of raw, start_date on activities
  for each row execute function set_activity_local_time();

update activities set
  timezone = strava_zone(raw->>'timezone'),
  start_date_local = coalesce(
    (raw->>'start_date_local')::timestamp,
    start_date at time zone coalesce(strava_zone(raw->>'timezone'), 'UTC'))
where start_date_local is null;

create index if not exists activities_athlete_local on activities(athlete_id, start_date_local desc);

create or replace function track_athlete_timezone() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if NEW.timezone is not null and not exists (
    select 1 from activities a
    where a.athlete_id = NEW.athlete_id and a.timezone is not null and a.start_date > NEW.start_date
  ) then
    update user_profiles set timezone = NEW.timezone
    where athlete_id = NEW.athlete_id and timezone is distinct from NEW.timezone;
  end if;
  return null;
end $$;
drop trigger if exists athlete_timezone on activities;
create trigger athlete_timezone after insert or update of timezone on activities
  for each row execute function track_athlete_timezone();

update user_profiles p set timezone = l.timezone
from (
  select distinct on (athlete_id) athlete_id, timezone from activities
  where timezone is not null order by athlete_id, start_date desc
) l
where l.athlete_id = p.athlete_id and p.timezone is distinct from l.timezone;

-- Range bounds are local calendar dates. Until the app deploys, it still sends
-- Jakarta-midnight instants; read those back as the Jakarta date they meant.
create or replace function coach_range_date(v text) returns date language sql stable as $$
 select case when v like '%T%' then (v::timestamptz at time zone 'Asia/Jakarta')::date else v::date end
$$;

-- Ranges are local calendar dates: [range_start, range_end).
create or replace function coach_range_totals(p_athletes bigint[],p_ranges jsonb) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
 select ids.aid as athlete_id,r.value->>'key' as key,coalesce(sum(a.distance),0) as meters,count(a.id) as runs
 from unnest(p_athletes) ids(aid) cross join jsonb_array_elements(p_ranges) r
 left join activities a on a.athlete_id=ids.aid and a.type='Run'
  and (r.value->>'range_start' is null or a.start_date_local::date>=coach_range_date(r.value->>'range_start'))
  and a.start_date_local::date<coach_range_date(r.value->>'range_end')
 group by ids.aid,r.value->>'key') t;
$$;

-- One row per athlete per local day. start_date is the day's first start instant;
-- start_date_local is the local calendar date the runs belong to.
create or replace function challenge_daily_context(p_athletes bigint[],p_from timestamptz,p_to timestamptz) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
 select athlete_id,min(start_date) as start_date,start_date_local::date as start_date_local,
 sum(distance) as distance,sum(total_elevation_gain) as total_elevation_gain,count(*) as source_count,'Run'::text as type
 from activities where athlete_id=any(p_athletes) and type='Run' and start_date>=p_from and start_date<p_to
 group by athlete_id,start_date_local::date)t;
$$;

create or replace function group_daily_context(p_athletes bigint[],p_from timestamptz,p_to timestamptz) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
 select min(id) as id,athlete_id,min(start_date) as start_date,start_date_local::date as start_date_local,
 sum(distance) as distance,sum(moving_time) as moving_time,sum(total_elevation_gain) as total_elevation_gain,count(*) as source_count,'Run'::text as type,count(best_challenge) as effort_count,
 (array_agg(best_challenge order by (best_challenge->>'averageSpeed')::numeric desc nulls last) filter(where best_challenge is not null))[1] as best_challenge
 from activities where athlete_id=any(p_athletes) and type='Run' and start_date>=p_from and start_date<p_to
 group by athlete_id,start_date_local::date)t;
$$;

create or replace function run_daily_totals(p_athletes bigint[],p_from timestamptz,p_to timestamptz,p_timezone text default 'Asia/Jakarta')
returns table(athlete_id bigint,day date,distance numeric,runs bigint,moving_time bigint)
language sql stable security definer set search_path=public as $$
 select a.athlete_id,coalesce(a.start_date_local::date,(a.start_date at time zone p_timezone)::date),sum(a.distance)::numeric,count(*),sum(a.moving_time)::bigint
 from activities a where a.athlete_id=any(p_athletes) and a.type='Run' and a.start_date>=p_from and a.start_date<p_to
 group by 1,2 order by 2 desc,1;
$$;

-- A race result matches the run on the race's local date where it was run.
create or replace function link_race_result() returns trigger language plpgsql security definer set search_path=public as $$
declare a activities; meters numeric;begin
 if NEW.result_activity_id is not null then
  select * into a from activities where id=NEW.result_activity_id and athlete_id=NEW.athlete_id for update;
  meters:=case NEW.distance_key when '5k' then 5000 when '10k' then 10000 when 'hm' then 21097.5 when 'fm' then 42195 end;
  if a.id is null or a.type<>'Run' or NEW.result_secs is null or abs(a.distance/meters-1)>0.05
   or coalesce(a.start_date_local::date,(a.start_date at time zone NEW.timezone)::date)<>NEW.race_date
  then raise exception 'Choose your recorded run at this race distance and date';end if;
  update activities set official_result_secs=NEW.result_secs where id=a.id;
 end if;
 if TG_OP='UPDATE' and OLD.result_activity_id is not null and OLD.result_activity_id is distinct from NEW.result_activity_id then
  update activities set official_result_secs=null where id=OLD.result_activity_id and athlete_id=OLD.athlete_id;
 end if;return NEW;
end $$;

revoke all on function coach_range_totals(bigint[],jsonb) from public,anon,authenticated;
grant execute on function coach_range_totals(bigint[],jsonb) to service_role;
revoke all on function challenge_daily_context(bigint[],timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function challenge_daily_context(bigint[],timestamptz,timestamptz) to service_role;
revoke all on function group_daily_context(bigint[],timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function group_daily_context(bigint[],timestamptz,timestamptz) to service_role;
revoke all on function run_daily_totals(bigint[],timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function run_daily_totals(bigint[],timestamptz,timestamptz,text) to service_role;

notify pgrst, 'reload schema';
commit;
