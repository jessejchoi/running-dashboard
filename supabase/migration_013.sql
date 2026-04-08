-- migration_013: group message board
create table if not exists group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id) on delete cascade,
  from_athlete_id bigint not null,
  to_athlete_id bigint,          -- null = message to the whole group
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists group_messages_group_idx
  on group_messages(group_id, created_at desc);
