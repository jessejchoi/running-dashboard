import { supabaseAdmin } from '../supabase'

/**
 * Fixed time grid for the max-mean pace curve. Each row in activity_best_efforts
 * is one (activity, duration) pair. The CP/D'/pmax fit reads this table and
 * fits the 3-parameter critical-pace model across the grid.
 *
 * Grid spans neuromuscular (30s) through aerobic endurance (90min). Sub-2min
 * points anchor pmax / speed reserve; 5–20min anchors CP; 30min+ informs the
 * endurance limit of CP.
 */
export const BEST_EFFORT_GRID_SECS = [
  30, 60, 90, 120, 180, 300, 480, 600, 900, 1200, 1800, 2700, 3600, 5400,
] as const

export interface BestEffort {
  durationSecs: number
  bestPaceSecPerKm: number
  avgHR: number | null
  startOffsetSec: number
}

interface StreamLike {
  time?: { data?: number[] | null } | null
  distance?: { data?: number[] | null } | null
  heartrate?: { data?: number[] | null } | null
}

/**
 * Compute the best (max-mean speed) effort at each grid duration.
 *
 * Algorithm: two-pointer sliding window over (time, distance) streams.
 * For each right endpoint j, advance i forward while a tighter window
 * [i+1, j] still meets the target duration; this leaves [i, j] as the
 * smallest valid window for j. Track the highest speed seen.
 *
 * Complexity: O(n) per duration × |GRID| durations.
 */
export function extractBestEfforts(streams: StreamLike | null | undefined): BestEffort[] {
  const time = streams?.time?.data
  const distance = streams?.distance?.data
  const hr = streams?.heartrate?.data

  if (!time || !distance || time.length !== distance.length || time.length < 2) return []
  const hasHR = Array.isArray(hr) && hr.length === time.length

  const totalDuration = time[time.length - 1] - time[0]
  const results: BestEffort[] = []

  for (const target of BEST_EFFORT_GRID_SECS) {
    if (target > totalDuration) break // grid sorted ascending; everything after fails too

    let bestSpeed = 0
    let bestStart = 0
    let bestEnd = 0
    let i = 0

    for (let j = 1; j < time.length; j++) {
      while (i + 1 < j && time[j] - time[i + 1] >= target) i++
      if (time[j] - time[i] < target) continue
      const dt = time[j] - time[i]
      if (dt <= 0) continue
      const speed = (distance[j] - distance[i]) / dt
      if (speed > bestSpeed) {
        bestSpeed = speed
        bestStart = i
        bestEnd = j
      }
    }

    if (bestSpeed > 0) {
      let avgHR: number | null = null
      if (hasHR) {
        let sum = 0
        let count = 0
        for (let k = bestStart; k <= bestEnd; k++) {
          const v = hr![k]
          if (typeof v === 'number') { sum += v; count++ }
        }
        avgHR = count > 0 ? sum / count : null
      }
      results.push({
        durationSecs: target,
        bestPaceSecPerKm: 1000 / bestSpeed,
        avgHR,
        startOffsetSec: time[bestStart] - time[0],
      })
    }
  }

  return results
}

interface StoreInput {
  activityId: number
  athleteId: number
  startDateISO: string
  efforts: BestEffort[]
}

/**
 * Replace cached best efforts for an activity. We delete-then-insert (rather
 * than upsert) so that durations no longer present in GRID are cleaned up if
 * we ever change the grid.
 */
export async function storeBestEfforts({ activityId, athleteId, startDateISO, efforts }: StoreInput): Promise<void> {
  await supabaseAdmin.from('activity_best_efforts').delete().eq('activity_id', activityId)
  if (efforts.length === 0) return
  const rows = efforts.map(e => ({
    activity_id: activityId,
    athlete_id: athleteId,
    activity_start_date: startDateISO,
    duration_secs: e.durationSecs,
    best_pace_sec_per_km: e.bestPaceSecPerKm,
    avg_hr: e.avgHR,
    start_offset_sec: e.startOffsetSec,
  }))
  await supabaseAdmin.from('activity_best_efforts').insert(rows)
}
