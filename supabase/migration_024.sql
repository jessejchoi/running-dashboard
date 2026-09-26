-- migration_024: Rhythm, each runner's weekly runs target and weapon (docs/designs/rhythm-boss-raid.md).
-- rhythm_weeks is a ledger: one row per runner per finished week, written once the
-- week is 2 days past its Sunday and never rewritten (lib/rhythmLedger.ts).
begin;
set local lock_timeout = '10s';

create table if not exists rhythm_weeks (
  athlete_id        bigint not null,
  week_start        date not null,
  runs              int not null check (runs >= 0),
  avg_runs          numeric(4,2) not null,
  target            int not null check (target >= 1),
  state             text not null check (state in ('on','short','zero')),
  level             int not null check (level between 0 and 12),
  level_before_miss int check (level_before_miss between 0 and 12),
  redeemed          boolean not null default false,
  streak            int not null check (streak >= 0),
  rules_version     int not null,
  frozen_at         timestamptz not null default now(),
  primary key (athlete_id, week_start)
);
alter table rhythm_weeks enable row level security;

notify pgrst, 'reload schema';
commit;
