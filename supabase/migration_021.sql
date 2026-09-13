-- RunDash expansion. Additive; historical betting records are intentionally retained.
create table if not exists app_sessions (
  token_hash text primary key, athlete_id bigint not null,
  expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists app_sessions_expiry on app_sessions(expires_at);
alter table app_sessions enable row level security;

alter table user_goals add column if not exists status text not null default 'active';
alter table user_goals add column if not exists is_primary boolean not null default false;
alter table user_goals add column if not exists result_secs integer;
alter table user_goals add column if not exists result_activity_id bigint;
alter table user_goals add column if not exists timezone text not null default 'Asia/Jakarta';
-- Older installations created the distance uniqueness under different names.
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='user_goals'::regclass
    and contype='u' and pg_get_constraintdef(oid) like '%athlete_id, distance_key%'
  loop execute format('alter table user_goals drop constraint %I', c.conname); end loop;
end $$;
create unique index if not exists user_goals_one_primary on user_goals(athlete_id) where is_primary and status='active';
create index if not exists user_goals_events on user_goals(athlete_id,race_date);
create table if not exists training_goals (
 id uuid primary key default gen_random_uuid(), athlete_id bigint not null,
 metric text not null check(metric in ('distance','runs')), target numeric not null check(target>0),
 timezone text not null default 'Asia/Jakarta', active boolean not null default true,
 unique(athlete_id,metric)
);
alter table training_goals enable row level security;
alter table activities add column if not exists official_result_secs integer;
alter table user_latest_estimates add column if not exists model_version text;
alter table user_latest_estimates add column if not exists result_json jsonb;
alter table estimate_snapshots add column if not exists model_version text;
create index if not exists activities_archive on activities(athlete_id,type,start_date desc,id desc);
create index if not exists effort_recent on activity_best_efforts(athlete_id,activity_start_date);

create table if not exists athlete_state (
 athlete_id bigint primary key, data_version bigint not null default 0,
 plan_version bigint not null default 0, updated_at timestamptz not null default now()
);
alter table athlete_state enable row level security;
create or replace function bump_athlete_data() returns trigger language plpgsql security definer set search_path=public as $$
declare aid bigint; begin
 aid := case when TG_OP='DELETE' then OLD.athlete_id else NEW.athlete_id end;
 insert into athlete_state(athlete_id,data_version) values(aid,1)
 on conflict(athlete_id) do update set data_version=athlete_state.data_version+1,updated_at=now();
 return null;
end $$;
do $$ declare t text; begin
 foreach t in array array['activities','user_goals','training_goals'] loop
 execute format('drop trigger if exists bump_data on %I',t);
 execute format('create trigger bump_data after insert or update or delete on %I for each row execute function bump_athlete_data()',t);
 end loop;
end $$;

create table if not exists training_preferences (
 athlete_id bigint primary key, config jsonb not null,
 updated_at timestamptz not null default now()
);
alter table training_preferences enable row level security;
drop trigger if exists bump_data on training_preferences;
create trigger bump_data after insert or update or delete on training_preferences for each row execute function bump_athlete_data();
alter table user_plans add column if not exists config jsonb;
alter table user_plans add column if not exists source text not null default 'manual';
alter table user_plans add column if not exists locked boolean not null default true;
alter table user_plans add column if not exists activity_id bigint;
alter table user_plans add column if not exists status text not null default 'planned';
alter table user_plans add column if not exists shared_run_id uuid;
alter table user_plans add column if not exists shared_run_version integer;
alter table user_plans add column if not exists matching_disabled boolean not null default false;
alter table user_plans add column if not exists event_changed boolean not null default false;
create unique index if not exists plan_activity_once on user_plans(athlete_id,activity_id) where activity_id is not null;
create table if not exists plan_revisions (
 id uuid primary key default gen_random_uuid(), athlete_id bigint not null,
 version bigint not null, before_json jsonb not null, after_json jsonb not null,
 reason text not null, input_version bigint not null, created_at timestamptz not null default now(),
 unique(athlete_id,version)
);
alter table plan_revisions enable row level security;

create table if not exists background_jobs (
 id uuid primary key default gen_random_uuid(), kind text not null,
 scope text not null, input_version text not null, payload jsonb not null default '{}',
 status text not null default 'queued', lease_token uuid, lease_until timestamptz,
 attempts integer not null default 0, available_at timestamptz not null default now(),
 last_error text, created_at timestamptz not null default now(), unique(kind,scope,input_version)
);
alter table background_jobs enable row level security;
create index if not exists jobs_ready on background_jobs(status,available_at);
create or replace function claim_job(p_id uuid) returns setof background_jobs language sql security definer set search_path=public as $$
 update background_jobs set status='running',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=attempts+1
 where id=p_id and available_at<=now() and (status='queued' or (status='running' and lease_until<now())) returning *;
$$;
create table if not exists history_imports (
 athlete_id bigint primary key, before_epoch bigint not null, page integer not null default 1,
 imported integer not null default 0, status text not null default 'queued',
 next_attempt_at timestamptz not null default now(), error text, updated_at timestamptz not null default now()
);
alter table history_imports enable row level security;
create table if not exists strava_budget (
 id boolean primary key default true check(id), resume_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table strava_budget enable row level security;

create table if not exists shared_runs (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references groups(id) on delete cascade,
 creator_id bigint not null, title text not null, starts_at timestamptz not null,
 timezone text not null default 'Asia/Jakarta', meeting_point text not null,
 description text not null default '', options jsonb not null default '[]',
 status text not null default 'scheduled', version integer not null default 1, created_at timestamptz not null default now()
);
create index if not exists shared_runs_upcoming on shared_runs(group_id,starts_at);
alter table shared_runs enable row level security;
create table if not exists shared_run_rsvps (
 run_id uuid references shared_runs(id) on delete cascade, athlete_id bigint not null,
 option_index integer not null default 0, primary key(run_id,athlete_id)
);
alter table shared_run_rsvps enable row level security;
create table if not exists coach_memory (
 group_id uuid primary key references groups(id) on delete cascade,
 focus text, evidence jsonb not null default '{}', input_version text,
 updated_at timestamptz not null default now()
);
alter table coach_memory enable row level security;
alter table group_coach_briefings add column if not exists input_version text;

-- Bounded output, complete totals: no PostgREST row-limit truncation of run history.
create or replace function run_daily_totals(p_athletes bigint[],p_from timestamptz,p_to timestamptz,p_timezone text default 'Asia/Jakarta')
returns table(athlete_id bigint,day date,distance numeric,runs bigint,moving_time bigint)
language sql stable security definer set search_path=public as $$
 select a.athlete_id,(a.start_date at time zone p_timezone)::date,sum(a.distance)::numeric,count(*),sum(a.moving_time)::bigint
 from activities a where a.athlete_id=any(p_athletes) and a.type='Run' and a.start_date>=p_from and a.start_date<p_to
 group by a.athlete_id,(a.start_date at time zone p_timezone)::date order by 2 desc,1;
$$;
-- RPCs are server-only; caller identity is verified by the app, never supplied by clients.
revoke all on function claim_job(uuid) from public,anon,authenticated;
grant execute on function claim_job(uuid) to service_role;
revoke all on function run_daily_totals(bigint[],timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function run_daily_totals(bigint[],timestamptz,timestamptz,text) to service_role;
create or replace function defer_strava(p_until timestamptz) returns void language sql security definer set search_path=public as $$
 insert into strava_budget(id,resume_at) values(true,p_until) on conflict(id) do update set resume_at=greatest(strava_budget.resume_at,excluded.resume_at),updated_at=now();
$$;
revoke all on function defer_strava(timestamptz) from public,anon,authenticated;
grant execute on function defer_strava(timestamptz) to service_role;
create or replace function set_primary_race(p_athlete bigint,p_goal uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(p_athlete);
 if not exists(select 1 from user_goals where id=p_goal and athlete_id=p_athlete and status='active') then raise exception 'Race not available'; end if;
 update user_goals set is_primary=false where athlete_id=p_athlete and is_primary;
 update user_goals set is_primary=true where id=p_goal and athlete_id=p_athlete;
end $$;
revoke all on function set_primary_race(bigint,uuid) from public,anon,authenticated;
grant execute on function set_primary_race(bigint,uuid) to service_role;
alter table user_plans drop constraint if exists user_plans_athlete_id_plan_date_session_index_key;
create or replace function commit_plan(p_athlete bigint,p_version bigint,p_data_version bigint,p_rows jsonb,p_delete uuid[],p_reason text,p_auto boolean default false,p_today date default current_date)
returns bigint language plpgsql security definer set search_path=public as $$
declare st athlete_state; before_rows jsonb; after_rows jsonb; row_data jsonb; sid uuid; existing user_plans; begin
 insert into athlete_state(athlete_id) values(p_athlete) on conflict do nothing;
 select * into st from athlete_state where athlete_id=p_athlete for update;
 if p_version is null or st.plan_version<>p_version or (p_data_version is not null and st.data_version<>p_data_version) then raise exception 'STALE_VERSION'; end if;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') into before_rows from user_plans p where athlete_id=p_athlete;
 if exists(select 1 from user_plans where id=any(p_delete) and athlete_id<>p_athlete) then raise exception 'Not your session'; end if;
 if p_auto and exists(select 1 from user_plans where id=any(p_delete) and athlete_id=p_athlete and (source<>'coach' or locked or plan_date<=p_today or activity_id is not null or status<>'planned')) then raise exception 'Protected session'; end if;
 delete from user_plans where athlete_id=p_athlete and id=any(p_delete);
 for row_data in select value from jsonb_array_elements(p_rows) loop
  sid := (row_data->>'id')::uuid;
  select * into existing from user_plans where id=sid;
  if found and existing.athlete_id<>p_athlete then raise exception 'Not your session'; end if;
  if p_auto and ((row_data->>'plan_date')::date<=p_today or (existing.id is not null and (existing.source<>'coach' or existing.locked or existing.activity_id is not null or existing.status<>'planned'))) then raise exception 'Protected session'; end if;
  insert into user_plans(id,athlete_id,plan_date,session_index,session_type,description,target_distance_meters,config,source,locked,activity_id,status,shared_run_id,shared_run_version,event_changed,matching_disabled)
  values(sid,p_athlete,(row_data->>'plan_date')::date,coalesce((row_data->>'session_index')::int,0),row_data->>'session_type',row_data->>'description',(row_data->>'target_distance_meters')::numeric,row_data->'config',coalesce(row_data->>'source','manual'),coalesce((row_data->>'locked')::boolean,true),(row_data->>'activity_id')::bigint,coalesce(row_data->>'status','planned'),(row_data->>'shared_run_id')::uuid,(row_data->>'shared_run_version')::int,coalesce((row_data->>'event_changed')::boolean,false),coalesce((row_data->>'matching_disabled')::boolean,false))
  on conflict(id) do update set plan_date=excluded.plan_date,session_index=excluded.session_index,session_type=excluded.session_type,description=excluded.description,target_distance_meters=excluded.target_distance_meters,config=excluded.config,source=excluded.source,locked=excluded.locked,activity_id=excluded.activity_id,status=excluded.status,shared_run_id=excluded.shared_run_id,shared_run_version=excluded.shared_run_version,event_changed=excluded.event_changed,matching_disabled=excluded.matching_disabled,updated_at=now();
 end loop;
 select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') into after_rows from user_plans p where athlete_id=p_athlete;
 update athlete_state set plan_version=plan_version+1,data_version=data_version+case when p_auto then 0 else 1 end,updated_at=now() where athlete_id=p_athlete;
 insert into plan_revisions(athlete_id,version,before_json,after_json,reason,input_version) values(p_athlete,p_version+1,before_rows,after_rows,p_reason,st.data_version);
 return p_version+1;
end $$;
revoke all on function commit_plan(bigint,bigint,bigint,jsonb,uuid[],text,boolean,date) from public,anon,authenticated;
grant execute on function commit_plan(bigint,bigint,bigint,jsonb,uuid[],text,boolean,date) to service_role;
-- Event edits lock the event, check its version, and flag linked plans atomically.
create or replace function update_shared_run(p_group uuid,p_event uuid,p_actor bigint,p_version integer,p_values jsonb,p_cancel boolean)
returns void language plpgsql security definer set search_path=public as $$
declare e shared_runs; role_name text; begin
 select role into role_name from group_members where group_id=p_group and athlete_id=p_actor;
 if role_name is null then raise exception 'Not a member';end if;
 select * into e from shared_runs where id=p_event and group_id=p_group for update;
 if e.id is null or (e.creator_id<>p_actor and role_name not in ('admin','owner')) then raise exception 'Not allowed';end if;
 if p_version is null or e.version<>p_version then raise exception 'STALE_VERSION';end if;
 if p_cancel then update shared_runs set status='cancelled',version=version+1 where id=p_event;
 else update shared_runs set title=p_values->>'title',starts_at=(p_values->>'starts_at')::timestamptz,timezone=p_values->>'timezone',meeting_point=p_values->>'meeting_point',description=p_values->>'description',options=p_values->'options',version=version+1 where id=p_event; end if;
 update user_plans set event_changed=true where shared_run_id=p_event;
 update athlete_state set plan_version=plan_version+1 where athlete_id in(select athlete_id from user_plans where shared_run_id=p_event);
end $$;
create or replace function rsvp_shared_run(p_group uuid,p_event uuid,p_actor bigint,p_version integer,p_option integer,p_join boolean,p_add_plan boolean,p_accept_change boolean,p_plan_version bigint)
returns void language plpgsql security definer set search_path=public as $$
declare e shared_runs; st athlete_state; sid uuid; date_local date; opt jsonb; cfg jsonb; begin
 perform 1 from group_members where group_id=p_group and athlete_id=p_actor for key share;
 if not found then raise exception 'Not a member';end if;
 select * into e from shared_runs where id=p_event and group_id=p_group for update;
 if p_version is null or e.id is null or e.version<>p_version then raise exception 'STALE_VERSION';end if;
 if p_join and e.status<>'scheduled' then raise exception 'Event cancelled';end if;
 if p_join and (p_option<0 or p_option>=jsonb_array_length(e.options)) then raise exception 'Invalid option';end if;
 if p_join then insert into shared_run_rsvps(run_id,athlete_id,option_index) values(p_event,p_actor,p_option) on conflict(run_id,athlete_id) do update set option_index=excluded.option_index;
 else delete from shared_run_rsvps where run_id=p_event and athlete_id=p_actor;end if;
 if not p_add_plan and not p_accept_change then return;end if;
 insert into athlete_state(athlete_id) values(p_actor) on conflict do nothing;
 select * into st from athlete_state where athlete_id=p_actor for update;
 if p_plan_version is null or st.plan_version<>p_plan_version then raise exception 'STALE_VERSION';end if;
 select id into sid from user_plans where athlete_id=p_actor and shared_run_id=p_event limit 1;
 if p_accept_change and not p_join then
  if exists(select 1 from user_plans where id=sid and (activity_id is not null or status='completed')) then raise exception 'Completed workout is preserved';end if;
  perform commit_plan(p_actor,p_plan_version,null,'[]',array_remove(array[sid],null),'Removed linked group session',false,current_date);
 elsif p_join and (sid is null or p_accept_change) then
  if exists(select 1 from user_plans where id=sid and (activity_id is not null or status='completed')) then raise exception 'Completed workout is preserved';end if;
  date_local:=(e.starts_at at time zone coalesce((select config->>'timezone' from training_preferences where athlete_id=p_actor),e.timezone))::date;opt:=e.options->p_option;
  cfg:=jsonb_build_object('name',e.title||' · '||(opt->>'pace')||' · '||to_char(e.starts_at at time zone e.timezone,'HH24:MI')||' '||e.timezone,'sessionType','easy','warmupMode','time','warmupMin',0,'warmupM',0,'warmupPace','','cooldownMode','time','cooldownMin',0,'cooldownM',0,'cooldownPace','','blocks',jsonb_build_array(jsonb_build_object('id','shared-distance','kind','continuous','label',opt->>'label','mode','distance','distanceM',(opt->>'distance_km')::numeric*1000,'durationMin',0,'targetPace','')));
  perform commit_plan(p_actor,p_plan_version,null,jsonb_build_array(jsonb_build_object('id',coalesce(sid,gen_random_uuid()),'plan_date',date_local,'session_index',0,'session_type','easy','description',cfg->>'name','target_distance_meters',(opt->>'distance_km')::numeric*1000,'config',cfg,'source','shared','locked',true,'shared_run_id',p_event,'shared_run_version',e.version,'event_changed',false)),'{}','Accepted linked group session',false,current_date);
 end if;
end $$;
create or replace function remove_member_rsvps() returns trigger language plpgsql security definer set search_path=public as $$
begin delete from shared_run_rsvps where athlete_id=old.athlete_id and run_id in(select id from shared_runs where group_id=old.group_id);
 update user_plans set event_changed=true where athlete_id=old.athlete_id and shared_run_id in(select id from shared_runs where group_id=old.group_id);
 update athlete_state set plan_version=plan_version+1 where athlete_id=old.athlete_id;return null;end $$;
drop trigger if exists remove_rsvps on group_members;
create trigger remove_rsvps after delete on group_members for each row execute function remove_member_rsvps();
revoke all on function update_shared_run(uuid,uuid,bigint,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function update_shared_run(uuid,uuid,bigint,integer,jsonb,boolean) to service_role;
revoke all on function rsvp_shared_run(uuid,uuid,bigint,integer,integer,boolean,boolean,boolean,bigint) from public,anon,authenticated;
grant execute on function rsvp_shared_run(uuid,uuid,bigint,integer,integer,boolean,boolean,boolean,bigint) to service_role;
create or replace function coach_range_totals(p_athletes bigint[],p_ranges jsonb) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
 select ids.aid as athlete_id,r.value->>'key' as key,coalesce(sum(a.distance),0) as meters,count(a.id) as runs
 from unnest(p_athletes) ids(aid) cross join jsonb_array_elements(p_ranges) r
 left join activities a on a.athlete_id=ids.aid and a.type='Run' and (r.value->>'range_start' is null or a.start_date>=(r.value->>'range_start')::timestamptz) and a.start_date<(r.value->>'range_end')::timestamptz
 group by ids.aid,r.value->>'key') t;
$$;
create or replace function challenge_daily_context(p_athletes bigint[],p_from timestamptz,p_to timestamptz) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
 select athlete_id,date_trunc('day',start_date at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' as start_date,
 sum(distance) as distance,sum(total_elevation_gain) as total_elevation_gain,count(*) as source_count,'Run'::text as type
 from activities where athlete_id=any(p_athletes) and type='Run' and start_date>=p_from and start_date<p_to
 group by athlete_id,date_trunc('day',start_date at time zone 'Asia/Jakarta'))t;
$$;
revoke all on function coach_range_totals(bigint[],jsonb) from public,anon,authenticated;
grant execute on function coach_range_totals(bigint[],jsonb) to service_role;
revoke all on function challenge_daily_context(bigint[],timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function challenge_daily_context(bigint[],timestamptz,timestamptz) to service_role;
create or replace function group_input_version(p_group uuid,p_model text) returns text language sql stable security definer set search_path=public as $$
 select md5(concat_ws('|',p_model,(now() at time zone 'Asia/Jakarta')::date,
 (select string_agg(concat_ws(':',m.athlete_id,m.role,s.data_version,s.plan_version,t.athlete_name),',' order by m.athlete_id) from group_members m left join athlete_state s using(athlete_id) left join strava_tokens t using(athlete_id) where m.group_id=p_group),
 (select string_agg(id::text||':'||version||':'||status,',' order by id) from shared_runs where group_id=p_group),
 (select md5(coalesce(jsonb_agg(to_jsonb(c) order by c.id)::text,'')) from group_challenges c where group_id=p_group)));
$$;
create or replace function commit_briefing(p_group uuid,p_model text,p_version text,p_job uuid,p_lease uuid,p_content jsonb,p_focus text,p_evidence jsonb)
returns boolean language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_group::text,0));
 if group_input_version(p_group,p_model)<>p_version or not exists(select 1 from background_jobs where id=p_job and lease_token=p_lease and status='running' and lease_until>now()) then return false;end if;
 insert into group_coach_briefings(group_id,content_json,generated_at,input_version) values(p_group,p_content,now(),p_version)
 on conflict(group_id) do update set content_json=excluded.content_json,generated_at=excluded.generated_at,input_version=excluded.input_version;
 insert into coach_memory(group_id,focus,evidence,input_version) values(p_group,p_focus,p_evidence,p_version)
 on conflict(group_id) do update set focus=excluded.focus,evidence=excluded.evidence,input_version=excluded.input_version,updated_at=now();
 return true;
end $$;
revoke all on function group_input_version(uuid,text) from public,anon,authenticated;
grant execute on function group_input_version(uuid,text) to service_role;
revoke all on function commit_briefing(uuid,text,text,uuid,uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function commit_briefing(uuid,text,text,uuid,uuid,jsonb,text,jsonb) to service_role;
-- Queue invalidation durably in the same transaction as data mutations.
create or replace function queue_athlete_refresh() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' or NEW.data_version<>OLD.data_version then
 insert into background_jobs(kind,scope,input_version) values
 ('adapt',NEW.athlete_id::text,NEW.data_version||':'||(now() at time zone 'Asia/Jakarta')::date),
 ('estimates',NEW.athlete_id::text,NEW.data_version||':'||(now() at time zone 'Asia/Jakarta')::date)
 on conflict(kind,scope,input_version) do nothing;
 end if;return null;
end $$;
drop trigger if exists queue_refresh on athlete_state;
create trigger queue_refresh after insert or update on athlete_state for each row execute function queue_athlete_refresh();
alter table athlete_state add column if not exists last_sync_at timestamptz;
create or replace function next_sync_athletes() returns table(athlete_id bigint) language sql security definer set search_path=public as $$
 select t.athlete_id from strava_tokens t left join athlete_state s using(athlete_id) order by s.last_sync_at nulls first,t.athlete_id limit 20;
$$;
revoke all on function next_sync_athletes() from public,anon,authenticated;
grant execute on function next_sync_athletes() to service_role;

-- Preserve each estimator generation independently, including within the same day.
alter table estimate_snapshots add column if not exists ideal_secs integer;
alter table estimate_snapshots add column if not exists today_secs integer;
alter table estimate_snapshots add column if not exists p80_low_secs integer;
alter table estimate_snapshots add column if not exists p80_high_secs integer;
update estimate_snapshots set model_version='legacy-unversioned' where model_version is null;
alter table estimate_snapshots alter column model_version set default 'legacy-unversioned';
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='estimate_snapshots'::regclass and contype in ('u','p')
 and pg_get_constraintdef(oid) not like '%model_version%'
 loop execute format('alter table estimate_snapshots drop constraint %I',c.conname);end loop;
end $$;
create unique index if not exists snapshots_model_day on estimate_snapshots(athlete_id,distance_key,snapshotted_at,model_version);
create or replace function commit_estimates(p_athlete bigint,p_version bigint,p_bundle jsonb) returns boolean
language plpgsql security definer set search_path=public as $$
declare st athlete_state; e jsonb; model text; day date; begin
 insert into athlete_state(athlete_id) values(p_athlete) on conflict do nothing;
 select * into st from athlete_state where athlete_id=p_athlete for update;
 if st.data_version<>p_version then return false;end if;
 model:=p_bundle->>'modelVersion';day:=(p_bundle->>'updatedAt')::timestamptz at time zone 'UTC';
 delete from estimate_snapshots where athlete_id=p_athlete and model_version=model and snapshotted_at=day;
 for e in select value from jsonb_array_elements(p_bundle->'estimates') loop
 if e->>'expectedSecs' is not null then
 insert into estimate_snapshots(athlete_id,distance_key,snapshotted_at,model_version,estimated_secs,ideal_secs,today_secs,p80_low_secs,p80_high_secs)
 values(p_athlete,e->>'distanceKey',day,model,round((e->>'expectedSecs')::numeric),round((e->>'idealSecs')::numeric),round((e->>'expectedSecs')::numeric),round((e->>'lowSecs')::numeric),round((e->>'highSecs')::numeric));
 end if;end loop;
 insert into user_latest_estimates(athlete_id,model_version,result_json,updated_at,secs_5k,secs_10k,secs_hm,secs_fm)
 select p_athlete,model,p_bundle,(p_bundle->>'updatedAt')::timestamptz,
 max(estimated_secs) filter(where distance_key='5k'),max(estimated_secs) filter(where distance_key='10k'),max(estimated_secs) filter(where distance_key='hm'),max(estimated_secs) filter(where distance_key='fm')
 from estimate_snapshots where athlete_id=p_athlete and model_version=model and snapshotted_at=day
 on conflict(athlete_id) do update set model_version=excluded.model_version,result_json=excluded.result_json,updated_at=excluded.updated_at,secs_5k=excluded.secs_5k,secs_10k=excluded.secs_10k,secs_hm=excluded.secs_hm,secs_fm=excluded.secs_fm;
 return true;
end $$;
revoke all on function commit_estimates(bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function commit_estimates(bigint,bigint,jsonb) to service_role;
create index if not exists jobs_coalesce on background_jobs(scope,kind,status);
create or replace function queue_athlete_refresh() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' or NEW.data_version<>OLD.data_version then
 -- Archive pages may change hundreds of rows; retain only one pending calculation per kind.
 update background_jobs set status='done',last_error='Superseded by newer input' where scope=NEW.athlete_id::text and kind in('adapt','estimates') and status='queued';
 insert into background_jobs(kind,scope,input_version) values
 ('adapt',NEW.athlete_id::text,NEW.data_version||':'||(now() at time zone 'Asia/Jakarta')::date),
 ('estimates',NEW.athlete_id::text,NEW.data_version||':'||(now() at time zone 'Asia/Jakarta')::date)
 on conflict(kind,scope,input_version) do nothing;
 end if;return null;
end $$;
create or replace function reconnect_history(p_athlete bigint) returns void language plpgsql security definer set search_path=public as $$
declare s history_imports;begin
 select * into s from history_imports where athlete_id=p_athlete for update;
 if s.status='reconnect_required' then
 update history_imports set status='queued',error=null,next_attempt_at=now() where athlete_id=p_athlete;
 update background_jobs set status='queued',available_at=now(),last_error=null,lease_token=null,lease_until=null
 where kind='history' and scope=p_athlete::text and input_version=s.before_epoch||':'||s.page;
 end if;end $$;
revoke all on function reconnect_history(bigint) from public,anon,authenticated;
grant execute on function reconnect_history(bigint) to service_role;

-- A recorded official result is attached only to the athlete's matching race activity.
create or replace function link_race_result() returns trigger language plpgsql security definer set search_path=public as $$
declare a activities; meters numeric;begin
 if NEW.result_activity_id is not null then
  select * into a from activities where id=NEW.result_activity_id and athlete_id=NEW.athlete_id for update;
  meters:=case NEW.distance_key when '5k' then 5000 when '10k' then 10000 when 'hm' then 21097.5 when 'fm' then 42195 end;
  if a.id is null or a.type<>'Run' or NEW.result_secs is null or abs(a.distance/meters-1)>0.05 or (a.start_date at time zone NEW.timezone)::date<>NEW.race_date then raise exception 'Choose your recorded run at this race distance and date';end if;
  update activities set official_result_secs=NEW.result_secs where id=a.id;
 end if;
 if TG_OP='UPDATE' and OLD.result_activity_id is not null and OLD.result_activity_id is distinct from NEW.result_activity_id then
  update activities set official_result_secs=null where id=OLD.result_activity_id and athlete_id=OLD.athlete_id;
 end if;return NEW;
end $$;
drop trigger if exists link_result on user_goals;
create trigger link_result before insert or update on user_goals for each row execute function link_race_result();
create or replace function save_training_preferences(p_athlete bigint,p_version bigint,p_config jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_config->>'primaryGoalId' is not null and not exists(select 1 from user_goals where athlete_id=p_athlete and id=(p_config->>'primaryGoalId')::uuid and status='active') then raise exception 'Choose your own active goal';end if;
 perform commit_plan(p_athlete,p_version,null,'[]','{}','Training preferences changed',false,current_date);
 insert into training_preferences(athlete_id,config) values(p_athlete,p_config) on conflict(athlete_id) do update set config=excluded.config,updated_at=now();
end $$;
revoke all on function save_training_preferences(bigint,bigint,jsonb) from public,anon,authenticated;
grant execute on function save_training_preferences(bigint,bigint,jsonb) to service_role;
-- Store a compact challenge effort once when details change; archive summaries need no streams.
alter table activities add column if not exists laps jsonb;
alter table activities add column if not exists splits jsonb;
alter table activities add column if not exists best_challenge jsonb;
create or replace function best_challenge_effort(p_id bigint,p_laps jsonb,p_splits jsonb) returns jsonb language sql immutable as $$
 select jsonb_build_object('activityId',p_id,'averageSpeed',(s->>'average_speed')::numeric,'paceSecPerKm',1000/(s->>'average_speed')::numeric,'distanceMeters',(s->>'distance')::numeric,'durationSecs',coalesce(s->>'moving_time',s->>'elapsed_time')::numeric,'source',src)
 from (select value s,'lap' src from jsonb_array_elements(case when jsonb_typeof(p_laps)='array' then p_laps else '[]'::jsonb end) where (value->>'distance')::numeric>=200 and coalesce(value->>'moving_time',value->>'elapsed_time')::numeric>=20
 union all select value,'split_1km' from jsonb_array_elements(case when jsonb_typeof(p_splits)='array' then p_splits else '[]'::jsonb end) where (value->>'distance')::numeric between 800 and 1200) t
 where (s->>'average_speed')::numeric>0 order by (s->>'average_speed')::numeric desc limit 1;
$$;
create or replace function refresh_challenge_effort() returns trigger language plpgsql as $$
begin NEW.best_challenge:=best_challenge_effort(NEW.id,NEW.laps,NEW.splits);return NEW;end $$;
drop trigger if exists challenge_effort on activities;
create trigger challenge_effort before insert or update of laps,splits on activities for each row execute function refresh_challenge_effort();
update activities set best_challenge=best_challenge_effort(id,laps,splits) where best_challenge is null and (laps is not null or splits is not null);
create or replace function group_daily_context(p_athletes bigint[],p_from timestamptz,p_to timestamptz) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (
 select min(id) as id,athlete_id,date_trunc('day',start_date at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta' as start_date,
 sum(distance) as distance,sum(moving_time) as moving_time,sum(total_elevation_gain) as total_elevation_gain,count(*) as source_count,'Run'::text as type,count(best_challenge) as effort_count,
 (array_agg(best_challenge order by (best_challenge->>'averageSpeed')::numeric desc nulls last) filter(where best_challenge is not null))[1] as best_challenge
 from activities where athlete_id=any(p_athletes) and type='Run' and start_date>=p_from and start_date<p_to
 group by athlete_id,date_trunc('day',start_date at time zone 'Asia/Jakarta'))t;
$$;
revoke all on function group_daily_context(bigint[],timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function group_daily_context(bigint[],timestamptz,timestamptz) to service_role;

-- Detail-derived evidence and athlete settings invalidate the same model cache.
do $$ declare t text;begin
 foreach t in array array['activity_best_efforts','activity_conditions','user_profiles'] loop
 if to_regclass(t) is not null then
 execute format('drop trigger if exists bump_data on %I',t);
 execute format('create trigger bump_data after insert or update or delete on %I for each row execute function bump_athlete_data()',t);
 end if;end loop;end $$;
