import { subMonths } from 'date-fns'
import type { DistanceKey } from '@/lib/goals'

export const RACE_DISTANCE_METERS: Record<DistanceKey, number> = { '5k': 5000, '10k': 10000, hm: 21097.5, fm: 42195 }

/** Six calendar months of performance evidence; recent load uses its own window. */
export function performanceCutoff(asOf = new Date(), windowDays?: number): string {
  return (windowDays == null ? subMonths(asOf, 6) : new Date(asOf.getTime() - windowDays * 86400000)).toISOString()
}

/** Existing heat heuristic, shared by source normalization and target conditions.
 * Distance interpolation avoids discontinuities between cached effort durations.
 * Unknown/invalid weather earns no correction. This is not a validated race model. */
export function performanceHeatMultiplier(wbgt: number | null | undefined, distanceM: number): number {
  if (wbgt == null || !Number.isFinite(wbgt) || wbgt < -10 || wbgt > 40 || !Number.isFinite(distanceM) || distanceM <= 0) return 1
  const knots = [[0, 0], [5000, 0.35], [10000, 0.6], [21097.5, 1], [42195, 1.25]]
  let factor = 1.25
  for (let i = 1; i < knots.length; i++) {
    if (distanceM <= knots[i][0]) {
      const [x, y] = knots[i - 1], [nextX, nextY] = knots[i]
      factor = y + (nextY - y) * (distanceM - x) / (nextX - x)
      break
    }
  }
  return 1 + Math.max(0, wbgt - 15) * 0.003 * factor
}

export interface EvidenceStreams {
  time?: { data?: number[] }
  distance?: { data?: number[] }
  grade_smooth?: { data?: number[] }
}
export interface MeasuredEffort {
  seconds: number
  startOffset: number
  endOffset: number
}

function validDistanceStream(streams: EvidenceStreams): boolean {
  const t = streams.time?.data, d = streams.distance?.data
  if (!t || !d || t.length !== d.length || t.length < 2) return false
  for (let i = 0; i < t.length; i++) {
    if (!Number.isFinite(t[i]) || !Number.isFinite(d[i]) || t[i] < 0 || d[i] < 0) return false
    // Reject impossible GPS jumps; elapsed time retains pauses, unlike moving time.
    if (i && (t[i] <= t[i - 1] || d[i] < d[i - 1] || (d[i] - d[i - 1]) / (t[i] - t[i - 1]) > 12)) return false
  }
  return true
}

/** Exact-distance continuous elapsed effort, not a projected time or official result.
 * Search both endpoints of the piecewise-linear distance/time curve. */
export function measuredDistanceEffort(streams: EvidenceStreams, meters: number): MeasuredEffort | null {
  if (!validDistanceStream(streams) || !Number.isFinite(meters) || meters <= 0) return null
  const t = streams.time!.data!, d = streams.distance!.data!, n = t.length
  if (d[n - 1] - d[0] < meters) return null
  let best: MeasuredEffort | null = null
  function add(start: number, end: number) {
    if (end > start && (!best || end - start < best.seconds)) best = { seconds: end - start, startOffset: start, endOffset: end }
  }
  let i = 0
  for (let j = 1; j < n; j++) {
    const target = d[j] - meters
    if (target < d[0]) continue
    while (i + 1 < j && d[i + 1] <= target) i++
    const delta = d[i + 1] - d[i]
    add(t[i] + (delta > 0 ? (target - d[i]) / delta : 0) * (t[i + 1] - t[i]), t[j])
  }
  let j = 1
  for (let i = 0; i < n - 1; i++) {
    const target = d[i] + meters
    if (target > d[n - 1]) break
    while (j < n - 1 && d[j] < target) j++
    const delta = d[j] - d[j - 1]
    add(t[i], t[j - 1] + (delta > 0 ? (target - d[j - 1]) / delta : 0) * (t[j] - t[j - 1]))
  }
  return best
}

/** Distance-weighted Minetti running energy cost relative to flat ground.
 * Converting energy cost to time assumes equal metabolic power: an approximation,
 * not an athlete-calibrated time saving. Both climbs AND descents are included.
 * Restrict to road-like profiles and modest corrections; otherwise leave unknown.
 * https://doi.org/10.1152/japplphysiol.01177.2001 */
export function terrainCostMultiplier(streams: EvidenceStreams, effort?: MeasuredEffort): number | null {
  if (!validDistanceStream(streams)) return null
  const t = streams.time!.data!, d = streams.distance!.data!, grades = streams.grade_smooth?.data
  if (!grades || grades.length !== t.length) return null
  const start = effort?.startOffset ?? t[0], end = effort?.endOffset ?? t[t.length - 1]
  let cost = 0, distance = 0
  for (let i = 1; i < t.length; i++) {
    const overlap = Math.min(end, t[i]) - Math.max(start, t[i - 1])
    if (overlap <= 0) continue
    const meters = (d[i] - d[i - 1]) * overlap / (t[i] - t[i - 1])
    if (meters <= 0) continue
    const slope = grades[i] / 100
    if (!Number.isFinite(slope) || Math.abs(slope) > 0.15) return null
    cost += meters * (155.4 * slope ** 5 - 30.4 * slope ** 4 - 43.3 * slope ** 3 + 46.3 * slope ** 2 + 19.5 * slope + 3.6) / 3.6
    distance += meters
  }
  if (!distance) return null
  const ratio = cost / distance
  return ratio >= 0.95 && ratio <= 1.05 ? ratio : null
}

export function raceClockEvidence(streams: EvidenceStreams, meters: number, elapsedSecs: number | null, officialSecs: number | null, recordedDistanceM: number) {
  const measured = measuredDistanceEffort(streams, meters)
  const times = streams.time?.data
  const completeClock = times?.length && elapsedSecs != null && elapsedSecs > 0
    && Math.abs(times[times.length - 1] - times[0] - elapsedSecs) <= 5
  const usableMeasured = completeClock && measured && measured.seconds <= elapsedSecs! ? measured : null
  const official = officialSecs != null && Number.isFinite(officialSecs) && officialSecs > 0 ? officialSecs : null
  // A short GPS recording with no official result does not prove completion of
  // the canonical race distance. Do not turn a tolerance match into a result.
  const fullElapsed = Number.isFinite(recordedDistanceM) && recordedDistanceM >= meters ? elapsedSecs : null
  const observedSecs = official ?? usableMeasured?.seconds ?? fullElapsed
  if (observedSecs == null || !Number.isFinite(observedSecs) || observedSecs <= 0) return null
  return {
    observedSecs,
    source: official ? 'official_result' as const : usableMeasured ? 'measured_distance' as const : 'full_elapsed' as const,
    terrainMultiplier: completeClock ? terrainCostMultiplier(streams, official ? undefined : usableMeasured ?? undefined) : null,
  }
}
