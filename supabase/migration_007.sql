-- RDCoach: cached AI briefings per group
create table if not exists group_coach_briefings (
  id           uuid        primary key default gen_random_uuid(),
  group_id     uuid        not null references groups(id) on delete cascade,
  content_json jsonb       not null,
  generated_at timestamptz not null default now(),
  generated_by bigint,
  constraint group_coach_briefings_group_id_unique unique (group_id)
);
