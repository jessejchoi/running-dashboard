-- Snapshot schema bump for the critical-pace engine.
--
-- Existing `estimated_secs` stays as the primary number the UI reads for
-- backward compatibility. The four new nullable columns carry the structured
-- output from the new engine. Until USE_CP_ENGINE is flipped on, the new
-- columns stay null on fresh rows.

alter table estimate_snapshots
  add column if not exists ideal_secs    int,
  add column if not exists today_secs    int,
  add column if not exists p80_low_secs  int,
  add column if not exists p80_high_secs int;
