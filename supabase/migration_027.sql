-- migration_027: Drop the retired Rhythm ledger.
-- Rhythm weeks are counted live from activities (rhythm_week_counts, migration_026)
-- since 2026-11-22; nothing reads or writes rhythm_weeks. Run in the Supabase SQL
-- editor any time after that release is live. DESTRUCTIVE: deletes the frozen
-- weekly rows (which include the wrongly frozen Nov 9 weeks). Repeatable.
begin;
set local lock_timeout = '10s';

drop table if exists rhythm_weeks;

notify pgrst, 'reload schema';
commit;
