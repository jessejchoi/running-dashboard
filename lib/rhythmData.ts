import { supabaseAdmin } from '@/lib/supabase'
import { addDays, localDate, validDate } from '@/lib/calendar'
import { athleteTimezones } from '@/lib/timezone'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { MIN_RUN_SECS, RUN_LOOKBACK_WEEKS, computeRhythm, isMonday, type RhythmInputs, type RhythmResult } from '@/lib/rhythm'

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

/**
 * Everything the rules need for each runner, in 2 queries whatever the group
 * size. Every week is counted from the runs in the database on each load, so
 * a late upload, an edit or a bad read never sticks: the next load recounts.
 * Finished weeks come back as per-week counts, so the read stays small as the
 * season grows; only the week in progress needs individual runs.
 */
export async function loadRhythmInputs(
  ids: number[],
  launchWeek: string,
  now = new Date(),
): Promise<Record<number, RhythmInputs>> {
  if (!ids.length) return {}
  // Counts from far enough back to average the weeks before launch week.
  const countsFrom = addDays(launchWeek, -RUN_LOOKBACK_WEEKS * 7)
  // This week in any runner's zone started at most 8 UTC days ago.
  const runsFrom = addDays(localDate(now, 'UTC'), -8)
  const [zones, counts, runs] = await Promise.all([
    athleteTimezones(ids),
    fetchAllPages<{ athlete_id: number; week_start: string; runs: number }>(() => supabaseAdmin
      .rpc('rhythm_week_counts', { p_athletes: ids, p_from: countsFrom, p_min_secs: MIN_RUN_SECS })
      .order('athlete_id')
      .order('week_start')),
    fetchAllPages(() => supabaseAdmin
      .from('activities')
      .select('id,athlete_id,start_date,start_date_local,moving_time')
      .in('athlete_id', ids)
      .eq('type', 'Run')
      .gte('start_date', `${runsFrom}T00:00:00Z`)
      .order('start_date')
      .order('id')),
  ])

  const inputs: Record<number, RhythmInputs> = {}
  for (const id of ids) inputs[id] = { zone: zones[id], weeks: {}, runs: [] }
  for (const row of counts) {
    const input = inputs[row.athlete_id]
    if (input) input.weeks[row.week_start] = row.runs
  }
  for (const run of runs) inputs[run.athlete_id]?.runs.push(run)
  return inputs
}

export interface RhythmSummaries {
  launchWeek: string
  now: Date
  byAthlete: Record<number, RhythmResult | null>
}

/** Each runner's Rhythm right now, or null when Rhythm is off. */
export async function loadRhythmSummaries(ids: number[], now = new Date()): Promise<RhythmSummaries | null> {
  const launchWeek = rhythmLaunchWeek()
  if (!launchWeek) return null
  const inputs = await loadRhythmInputs(ids, launchWeek, now)
  const byAthlete: Record<number, RhythmResult | null> = {}
  for (const id of ids) byAthlete[id] = computeRhythm(inputs[id], launchWeek, now)
  return { launchWeek, now, byAthlete }
}
