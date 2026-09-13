-- Repair installations where the old snapshot identity was a PRIMARY KEY,
-- which migration 021 originally missed when removing same-day uniqueness.
-- Preserve every snapshot; the versioned unique index remains the identity.
begin;
set local lock_timeout = '10s';
create unique index if not exists snapshots_model_day
  on public.estimate_snapshots(athlete_id,distance_key,snapshotted_at,model_version);
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid='public.estimate_snapshots'::regclass
      and contype in ('p','u')
      and pg_get_constraintdef(oid) not like '%model_version%'
  loop
    execute format('alter table public.estimate_snapshots drop constraint %I', c.conname);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
