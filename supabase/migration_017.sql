-- migration_017: Group bets

create table if not exists group_bets (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references groups(id) on delete cascade,
  creator_athlete_id bigint not null,
  mode               text not null check (mode in ('direct', 'pool')),
  target_athlete_id  bigint not null,
  metric_type        text not null check (metric_type in ('weekly_distance', 'distance', 'run_count', 'longest_run', 'race_time')),
  comparator         text not null check (comparator in ('gte', 'lte')),
  target_value       numeric,
  distance_key       text check (distance_key is null or distance_key in ('5k', '10k', 'hm', 'fm')),
  target_secs        integer,
  window_start       date not null,
  window_end         date not null,
  pledge_cents       integer not null check (pledge_cents > 0),
  currency           text not null default 'USD',
  creator_side       text not null check (creator_side in ('for', 'against')),
  status             text not null default 'open' check (status in ('open', 'locked', 'won', 'lost', 'void')),
  outcome_achieved   boolean,
  winning_side       text check (winning_side is null or winning_side in ('for', 'against')),
  resolved_at        timestamptz,
  resolution         jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (window_end >= window_start),
  check (
    (metric_type = 'race_time' and distance_key is not null and target_secs is not null and target_value is null)
    or
    (metric_type <> 'race_time' and target_value is not null and distance_key is null and target_secs is null)
  )
);

create table if not exists group_bet_positions (
  id           uuid primary key default gen_random_uuid(),
  bet_id       uuid not null references group_bets(id) on delete cascade,
  athlete_id   bigint not null,
  side         text not null check (side in ('for', 'against')),
  pledge_cents integer not null check (pledge_cents > 0),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (bet_id, athlete_id)
);

create index if not exists group_bets_group_status_idx
  on group_bets(group_id, status, window_end desc);

create index if not exists group_bets_target_window_idx
  on group_bets(target_athlete_id, window_start, window_end);

create index if not exists group_bet_positions_bet_idx
  on group_bet_positions(bet_id);
