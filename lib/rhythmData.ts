import { supabaseAdmin } from '@/lib/supabase'
import { addDays, validDate } from '@/lib/calendar'
import { athleteTimezones } from '@/lib/timezone'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { RUN_LOOKBACK_WEEKS, computeRhythm, isMonday, type RhythmInputs, type RhythmResult } from '@/lib/rhythm'

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
 * size. Every week is folded from the runs in the database on each load, so a
 * late upload, an edit or a bad read never sticks: the next load recounts.
 */
export async function loadRhythmInputs(
  ids: number[],
  launchWeek: string,
): Promise<Record<number, RhythmInputs>> {
  if (!ids.length) return {}
  // Runs from far enough back to average the weeks before launch week.
  const runsFrom = addDays(launchWeek, -RUN_LOOKBACK_WEEKS * 7)
  const [zones, runs] = await Promise.all([
    athleteTimezones(ids),
    fetchAllPages(() => supabaseAdmin
      .from('activities')
      .select('id,athlete_id,start_date,start_date_local,moving_time')
      .in('athlete_id', ids)
      .eq('type', 'Run')
      // A day early: start_date is UTC and a runner ahead of UTC may already be in the window.
      .gte('start_date', `${addDays(runsFrom, -1)}T00:00:00Z`)
      .order('start_date')
      .order('id')),
  ])

  const inputs: Record<number, RhythmInputs> = {}
  for (const id of ids) inputs[id] = { zone: zones[id], runs: [] }
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
  const inputs = await loadRhythmInputs(ids, launchWeek)
  const byAthlete: Record<number, RhythmResult | null> = {}
  for (const id of ids) byAthlete[id] = computeRhythm(inputs[id], launchWeek, now)
  return { launchWeek, now, byAthlete }
}
