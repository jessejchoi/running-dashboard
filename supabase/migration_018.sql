-- migration_018: Bets V2 group game layer

alter table group_bets
  drop constraint if exists group_bets_metric_type_check,
  drop constraint if exists group_bets_check,
  drop constraint if exists group_bets_check1;

alter table group_bets
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists best_activity_id bigint references activities(id) on delete set null,
  add column if not exists source_event_id uuid;

alter table group_bets
  add constraint group_bets_metric_type_check
  check (metric_type in ('weekly_distance', 'distance', 'run_count', 'longest_run', 'race_time', 'planned_session'));

alter table group_bets
  add constraint group_bets_metric_payload_check
  check (
    (metric_type = 'race_time' and distance_key is not null and target_secs is not null and target_value is null)
    or
    (metric_type <> 'race_time' and target_value is not null and distance_key is null and target_secs is null)
  );

create table if not exists group_bet_events (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references groups(id) on delete cascade,
  bet_id           uuid references group_bets(id) on delete set null,
  actor_athlete_id bigint,
  event_type       text not null check (event_type in ('created', 'joined', 'accepted', 'declined', 'resolved', 'voided', 'deleted', 'coach_suggested')),
  payload          jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);

create table if not exists group_bet_comments (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  bet_id            uuid not null references group_bets(id) on delete cascade,
  author_athlete_id bigint not null,
  content           text not null check (char_length(content) between 1 and 280),
  created_at        timestamptz not null default now()
);

alter table group_bets
  add constraint group_bets_source_event_fk
  foreign key (source_event_id) references group_bet_events(id) on delete set null;

create index if not exists group_bet_events_group_created_idx
  on group_bet_events(group_id, created_at desc);

create index if not exists group_bet_events_bet_idx
  on group_bet_events(bet_id, created_at desc);

create index if not exists group_bet_comments_bet_created_idx
  on group_bet_comments(bet_id, created_at asc);
