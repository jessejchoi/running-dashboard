-- migration_003.sql: Group challenges

create table if not exists group_challenges (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references groups(id) on delete cascade not null,
  name         text not null,
  description  text,
  target_meters numeric not null,
  start_date   date not null,
  end_date     date not null,
  created_by   bigint not null,
  created_at   timestamptz default now()
);

create index if not exists group_challenges_group_id_idx on group_challenges(group_id);
