/**
 * Helpers for reading and writing estimate_snapshots.
 *
 * Snapshots store the athlete's best race estimate (in seconds) once per day,
 * so historical deltas can be read with a single cheap DB lookup instead of
 * re-running the full analysis engine on every page load.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { type DistanceKey } from '@/lib/goals'

export type EstimateDelta = {
  week: number | null    // current - snapshot ~7d ago  (negative = improved)
  month: number | null   // current - snapshot ~30d ago
  quarter: number | null // current - snapshot ~90d ago
}

export type AllDeltas = Record<DistanceKey, EstimateDelta>

type SnapshotLookupWindow = {
  preferBeforeDays: number
  allowAfterDays: number
}

/** Date string YYYY-MM-DD, offset by N days from today. */
function daysAgoDate(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toISOString().split('T')[0]
}

/** Today's date string. */
export function todayDate(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Query all snapshots from the last 95 days for the athlete.
 * Returns a map: snapshotted_at → distance_key → estimated_secs.
 */
async function fetchSnapshotWindow(athleteId: number) {
  try {
    const cutoff = daysAgoDate(95)
    const { data } = await supabaseAdmin
      .from('estimate_snapshots')
      .select('distance_key, estimated_secs, snapshotted_at')
      .eq('athlete_id', athleteId)
      .gte('snapshotted_at', cutoff)
      .order('snapshotted_at', { ascending: false })

    // Map: date string → distance_key → secs
    const byDate: Record<string, Record<string, number>> = {}
    for (const row of data ?? []) {
      const dateKey = String(row.snapshotted_at).split('T')[0]
      byDate[dateKey] ??= {}
      byDate[dateKey][row.distance_key] = row.estimated_secs
    }
    return byDate
  } catch {
    return {}
  }
}

/**
 * Find the best historical snapshot around a target date.
 * Prefer snapshots on or before the target so progress compares "now" to a
 * real past state rather than a future one. Allow a small after-target fallback
 * for sparse histories.
 */
function findHistoricalSnapshot(
  byDate: Record<string, Record<string, number>>,
  targetDate: string,
  distanceKey: string,
  window: SnapshotLookupWindow,
): number | null {
  const target = new Date(targetDate).getTime()
  let bestBefore: number | null = null
  let bestBeforeDiff = Infinity
  let bestAfter: number | null = null
  let bestAfterDiff = Infinity

  for (const [dateStr, distMap] of Object.entries(byDate)) {
    if (!(distanceKey in distMap)) continue
    const diffDays = (new Date(dateStr).getTime() - target) / 86_400_000

    if (diffDays <= 0) {
      const beforeDays = Math.abs(diffDays)
      if (beforeDays <= window.preferBeforeDays && beforeDays < bestBeforeDiff) {
        bestBeforeDiff = beforeDays
        bestBefore = distMap[distanceKey]
      }
    } else if (diffDays <= window.allowAfterDays && diffDays < bestAfterDiff) {
      bestAfterDiff = diffDays
      bestAfter = distMap[distanceKey]
    }
  }
  return bestBefore ?? bestAfter
}

/**
 * Compute deltas for all distance keys given the current estimates and
 * snapshot window. Returns null values wherever no snapshot is found.
 */
export function buildAllDeltas(
  current: Record<string, number | null>,
  byDate: Record<string, Record<string, number>>,
): AllDeltas {
  const targets = {
    week:    { date: daysAgoDate(7),  window: { preferBeforeDays: 21, allowAfterDays: 3 } },
    month:   { date: daysAgoDate(30), window: { preferBeforeDays: 45, allowAfterDays: 5 } },
    quarter: { date: daysAgoDate(90), window: { preferBeforeDays: 120, allowAfterDays: 7 } },
  }

  const keys: DistanceKey[] = ['5k', '10k', 'hm', 'fm']
  const result = {} as AllDeltas

  for (const dk of keys) {
    const cur = current[dk] ?? null
    result[dk] = {
      week:    cur != null ? buildDelta(cur, findHistoricalSnapshot(byDate, targets.week.date, dk, targets.week.window)) : null,
      month:   cur != null ? buildDelta(cur, findHistoricalSnapshot(byDate, targets.month.date, dk, targets.month.window)) : null,
      quarter: cur != null ? buildDelta(cur, findHistoricalSnapshot(byDate, targets.quarter.date, dk, targets.quarter.window)) : null,
    }
  }
  return result
}

function buildDelta(current: number, historical: number | null): number | null {
  return historical != null ? current - historical : null
}

/** Optional structured payload from the new CP engine, written alongside the
 *  legacy `estimated_secs` column. Existing callers can omit `extras`. */
export interface SnapshotExtras {
  idealSecs?: number | null
  todaySecs?: number | null
  p80LowSecs?: number | null
  p80HighSecs?: number | null
}

/**
 * Fire-and-forget: upsert today's estimates as a snapshot row.
 * Does not block the page render.
 *
 * `extras` is a per-distance map of CP-engine output. When provided, the
 * `ideal_secs` / `today_secs` / `p80_*` columns are populated; otherwise
 * those columns stay null on the upserted row.
 */
export async function saveSnapshot(
  athleteId: number,
  estimates: Record<string, number | null>,
  extras?: Record<string, SnapshotExtras | undefined>,
): Promise<void> {
  const today = todayDate()
  const rows = (Object.entries(estimates) as [string, number | null][])
    .filter(([, v]) => v != null)
    .map(([dk, secs]) => {
      const e = extras?.[dk]
      return {
        athlete_id: athleteId,
        distance_key: dk,
        estimated_secs: Math.round(secs as number),
        snapshotted_at: today,
        ideal_secs:    e?.idealSecs    != null ? Math.round(e.idealSecs)    : null,
        today_secs:    e?.todaySecs    != null ? Math.round(e.todaySecs)    : null,
        p80_low_secs:  e?.p80LowSecs   != null ? Math.round(e.p80LowSecs)   : null,
        p80_high_secs: e?.p80HighSecs  != null ? Math.round(e.p80HighSecs)  : null,
      }
    })

  if (rows.length === 0) return

  const { error } = await supabaseAdmin
    .from('estimate_snapshots')
    .upsert(rows, { onConflict: 'athlete_id,distance_key,snapshotted_at' })

  if (error) {
    throw error
  }

  await supabaseAdmin
    .from('user_latest_estimates')
    .upsert({
      athlete_id: athleteId,
      secs_5k:  estimates['5k']  != null ? Math.round(estimates['5k']!)  : null,
      secs_10k: estimates['10k'] != null ? Math.round(estimates['10k']!) : null,
      secs_hm:  estimates['hm']  != null ? Math.round(estimates['hm']!)  : null,
      secs_fm:  estimates['fm']  != null ? Math.round(estimates['fm']!)  : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' })
}

export interface TodaysExtras {
  idealSecs: number | null
  todaySecs: number | null
  p80LowSecs: number | null
  p80HighSecs: number | null
}

/**
 * Fetch the four new CP-engine columns from today's snapshot row.
 * Returns an empty map when the engine isn't running or the row hasn't been
 * written yet — callers should treat null fields as "show only the legacy
 * single number".
 */
export async function fetchTodaysExtras(
  athleteId: number,
): Promise<Record<string, TodaysExtras>> {
  try {
    const today = todayDate()
    const { data } = await supabaseAdmin
      .from('estimate_snapshots')
      .select('distance_key, ideal_secs, today_secs, p80_low_secs, p80_high_secs')
      .eq('athlete_id', athleteId)
      .eq('snapshotted_at', today)

    const result: Record<string, TodaysExtras> = {}
    for (const row of data ?? []) {
      result[String(row.distance_key)] = {
        idealSecs:    row.ideal_secs    ?? null,
        todaySecs:    row.today_secs    ?? null,
        p80LowSecs:   row.p80_low_secs  ?? null,
        p80HighSecs:  row.p80_high_secs ?? null,
      }
    }
    return result
  } catch {
    return {}
  }
}

/** Combined helper: fetch snapshot window + build deltas. */
export async function fetchDeltas(
  athleteId: number,
  current: Record<string, number | null>,
): Promise<AllDeltas> {
  const byDate = await fetchSnapshotWindow(athleteId)
  return buildAllDeltas(current, byDate)
}

/**
 * Fetch snapshot window and return the raw byDate map.
 * Useful when you need both a today-cache check and delta computation
 * from a single DB query.
 */
export async function fetchSnapshotsByDate(
  athleteId: number,
): Promise<Record<string, Record<string, number>>> {
  return fetchSnapshotWindow(athleteId)
}
