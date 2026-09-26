import { supabaseAdmin } from '@/lib/supabase'
import { addDays, localDate, validDate, weekStart } from '@/lib/calendar'
import { athleteTimezones } from '@/lib/timezone'
import { fetchAllPages } from '@/lib/fetchAllPages'
import {
  RHYTHM_RULES_VERSION,
  RUN_LOOKBACK_WEEKS,
  computeRhythm,
  firstOpenWeek,
  isMonday,
  type LedgerRow,
  type RhythmInputs,
  type RhythmResult,
} from '@/lib/rhythm'

const LEDGER_COLUMNS = 'athlete_id,week_start,runs,avg_runs,target,state,level,level_before_miss,redeemed,streak,rules_version'

/** Frozen rows to read per runner: the 6-week average and 4-week redemption lookback, with room to spare. */
const LEDGER_WINDOW_WEEKS = 30

/**
 * The Monday Rhythm starts, from RHYTHM_LAUNCH_WEEK. It doubles as the feature
 * flag: unset (or not a Monday) means Rhythm is off everywhere.
 */
export function rhythmLaunchWeek(value = process.env.RHYTHM_LAUNCH_WEEK): string | null {
  if (!value) return null
  if (!validDate(value) || !isMonday(value)) {
    console.error(`[rhythm] RHYTHM_LAUNCH_WEEK=${value} is not a Monday (YYYY-MM-DD); Rhythm is off`)
    return null
  }
  return value
}

// Postgres 42P01, or PostgREST's schema-cache miss: migration 024 isn't applied yet.
function isMissingTable(error: any) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

function toLedgerRow(row: any): LedgerRow {
  return {
    week_start: row.week_start,
    runs: row.runs,
    avg_runs: Number(row.avg_runs),
    target: row.target,
    state: row.state,
    level: row.level,
    level_before_miss: row.level_before_miss,
    redeemed: row.redeemed,
    streak: row.streak,
    rules_version: row.rules_version,
  }
}

/**
 * Everything the rules need for each runner, in 3 queries whatever the group
 * size. Returns null when the Rhythm tables don't exist yet.
 */
export async function loadRhythmInputs(
  ids: number[],
  launchWeek: string,
  now = new Date(),
): Promise<Record<number, RhythmInputs> | null> {
  if (!ids.length) return {}
  // A day's slack covers every zone, so the window doesn't wait on the timezone read.
  const ledgerFrom = weekStart(addDays(localDate(now, 'UTC'), -LEDGER_WINDOW_WEEKS * 7 - 1))
  const windowStart = ledgerFrom > launchWeek ? ledgerFrom : launchWeek

  let zones: Record<number, string>
  let ledgerRows: any[]
  try {
    ;[zones, ledgerRows] = await Promise.all([
      athleteTimezones(ids),
      fetchAllPages(() => supabaseAdmin
        .from('rhythm_weeks')
        .select(LEDGER_COLUMNS)
        .in('athlete_id', ids)
        .gte('week_start', windowStart)
        .order('athlete_id')
        .order('week_start')),
    ])
  } catch (error) {
    if (isMissingTable(error)) {
      console.error('[rhythm] rhythm_weeks is missing; paste supabase/migration_024.sql. Rhythm is off')
      return null
    }
    throw error
  }

  const ledgers: Record<number, LedgerRow[]> = {}
  for (const id of ids) ledgers[id] = []
  for (const row of ledgerRows) ledgers[row.athlete_id]?.push(toLedgerRow(row))

  // A runner whose freezing stalled before the window: start from their latest frozen row.
  const stalled = ids.filter(id => !ledgers[id].length && windowStart > launchWeek)
  await Promise.all(stalled.map(async id => {
    const { data, error } = await supabaseAdmin
      .from('rhythm_weeks')
      .select(LEDGER_COLUMNS)
      .eq('athlete_id', id)
      .order('week_start', { ascending: false })
      .limit(1)
    if (error) throw error
    ledgers[id] = (data ?? []).map(toLedgerRow)
  }))

  for (const id of ids) {
    const stale = ledgers[id].find(r => r.rules_version !== RHYTHM_RULES_VERSION)
    if (stale) console.warn(`[rhythm] athlete ${id} has rows from rules v${stale.rules_version}; run scripts/rebuild-rhythm.ts`)
  }

  // Runs from far enough back to average the weeks before each runner's first open week.
  const runsFrom = ids
    .map(id => addDays(firstOpenWeek(ledgers[id], launchWeek), -RUN_LOOKBACK_WEEKS * 7))
    .reduce((a, b) => (a < b ? a : b))
  const runs = await fetchAllPages(() => supabaseAdmin
    .from('activities')
    .select('id,athlete_id,start_date,start_date_local,moving_time')
    .in('athlete_id', ids)
    .eq('type', 'Run')
    // A day early: start_date is UTC and a runner ahead of UTC may already be in the window.
    .gte('start_date', `${addDays(runsFrom, -1)}T00:00:00Z`)
    .order('start_date')
    .order('id'))

  const inputs: Record<number, RhythmInputs> = {}
  for (const id of ids) inputs[id] = { zone: zones[id], ledger: ledgers[id], runs: [] }
  for (const run of runs) inputs[run.athlete_id]?.runs.push(run)
  return inputs
}

export interface RhythmSummaries {
  launchWeek: string
  now: Date
  byAthlete: Record<number, RhythmResult | null>
  /** What the summaries were computed from, so a caller can freeze without reloading. */
  inputs: Record<number, RhythmInputs>
}

/** Each runner's Rhythm right now, or null when Rhythm is off. */
export async function loadRhythmSummaries(ids: number[], now = new Date()): Promise<RhythmSummaries | null> {
  const launchWeek = rhythmLaunchWeek()
  if (!launchWeek) return null
  const inputs = await loadRhythmInputs(ids, launchWeek, now)
  if (!inputs) return null
  const byAthlete: Record<number, RhythmResult | null> = {}
  for (const id of ids) byAthlete[id] = computeRhythm(inputs[id], launchWeek, now)
  return { launchWeek, now, byAthlete, inputs }
}
