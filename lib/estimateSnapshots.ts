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
      byDate[row.snapshotted_at] ??= {}
      byDate[row.snapshotted_at][row.distance_key] = row.estimated_secs
    }
    return byDate
  } catch {
    return {}
  }
}

/** Find the closest snapshot (by date) within ±3 days of the target. */
function findClosest(
  byDate: Record<string, Record<string, number>>,
  targetDate: string,
  distanceKey: string,
): number | null {
  const target = new Date(targetDate).getTime()
  let best: number | null = null
  let bestDiff = Infinity

  for (const [dateStr, distMap] of Object.entries(byDate)) {
    if (!(distanceKey in distMap)) continue
    const diff = Math.abs(new Date(dateStr).getTime() - target)
    const diffDays = diff / 86_400_000
    if (diffDays <= 3 && diff < bestDiff) {
      bestDiff = diff
      best = distMap[distanceKey]
    }
  }
  return best
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
    week:    daysAgoDate(7),
    month:   daysAgoDate(30),
    quarter: daysAgoDate(90),
  }

  const keys: DistanceKey[] = ['5k', '10k', 'hm', 'fm']
  const result = {} as AllDeltas

  for (const dk of keys) {
    const cur = current[dk] ?? null
    result[dk] = {
      week:    cur != null ? buildDelta(cur, findClosest(byDate, targets.week,    dk)) : null,
      month:   cur != null ? buildDelta(cur, findClosest(byDate, targets.month,   dk)) : null,
      quarter: cur != null ? buildDelta(cur, findClosest(byDate, targets.quarter, dk)) : null,
    }
  }
  return result
}

function buildDelta(current: number, historical: number | null): number | null {
  return historical != null ? current - historical : null
}

/**
 * Fire-and-forget: upsert today's estimates as a snapshot row.
 * Does not block the page render.
 */
export function saveSnapshot(
  athleteId: number,
  estimates: Record<string, number | null>,
): void {
  const today = todayDate()
  const rows = (Object.entries(estimates) as [string, number | null][])
    .filter(([, v]) => v != null)
    .map(([dk, secs]) => ({
      athlete_id: athleteId,
      distance_key: dk,
      estimated_secs: Math.round(secs as number),
      snapshotted_at: today,
    }))

  if (rows.length === 0) return

  void supabaseAdmin
    .from('estimate_snapshots')
    .upsert(rows, { onConflict: 'athlete_id,distance_key,snapshotted_at' })
}

/** Combined helper: fetch snapshot window + build deltas. */
export async function fetchDeltas(
  athleteId: number,
  current: Record<string, number | null>,
): Promise<AllDeltas> {
  const byDate = await fetchSnapshotWindow(athleteId)
  return buildAllDeltas(current, byDate)
}
