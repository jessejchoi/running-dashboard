import {
  CP_MODEL_VERSION,
  fitCriticalPace,
  predictTimeForDistance,
  type BestEffortPoint,
} from './criticalPace'
import { type DistanceKey, distanceKm } from '@/lib/goals'
import { personalizationVersion } from './personalization'
import { analysisWeightForActivity } from '@/lib/run-classification'

export const DEFAULT_CALIBRATION = { huberDelta: 0.15, raceWeight: 0.9 }
export const EXPECTED_MODEL_VERSION = 'expected-observed-v1'
export function expectedEstimatorEnabled() {
  return process.env.EXPECTED_ESTIMATOR_ENABLED === 'true'
}
export function activeModelVersion() {
  return expectedEstimatorEnabled() ? EXPECTED_MODEL_VERSION : CP_MODEL_VERSION + personalizationVersion()
}
export interface ExpectedEstimate {
  distanceKey: DistanceKey
  expectedSecs: number | null
  idealSecs: number | null
  lowSecs: number | null
  highSecs: number | null
  confidence: 'low' | 'medium' | 'high'
  status: 'ready' | 'insufficient_evidence'
  evidence: { activityId: number; date: string; kind: string }[]
  freshness?: { latestEvidenceAt: string | null; ageDays: number | null }
  asOf: string
  modelVersion: string
  explanation: string
}
export interface ObservationRun {
  id: number
  start_date: string
  distance: number
  moving_time: number
  elapsed_time?: number
  official_result_secs?: number | null
  is_race?: boolean
  run_type?: string
  run_type_manual?: boolean
  excluded_from_analysis?: boolean
  raw?: any
  wbgt?: number | null
}
export interface ObservationEffort {
  activity_id: number
  duration_secs: number
  best_pace_sec_per_km: number
}
const KEYS: DistanceKey[] = ['5k', '10k', 'hm', 'fm']
const QUALITY = new Set([
  'threshold',
  'tempo',
  'long_progressive',
  'interval',
  'intervals',
  'interval_5k',
  'interval_10k',
  'race',
])
export function confirmedRace(run: ObservationRun) {
  return (
    !!run.official_result_secs ||
    run.raw?.workout_type === 1 ||
    (!!run.run_type_manual && (run.is_race || run.run_type === 'race'))
  )
}
export function heatCost(wbgt: number | null | undefined, key: DistanceKey) {
  return (
    1 +
    Math.max(0, (wbgt ?? 15) - 15) *
      0.003 *
      { '5k': 0.35, '10k': 0.6, hm: 1, fm: 1.25 }[key]
  )
}
export function estimateObserved(
  runs: ObservationRun[],
  efforts: ObservationEffort[],
  asOf: Date,
  usualWbgt: number | null = null,
  calibration = DEFAULT_CALIBRATION,
): ExpectedEstimate[] {
  const cutoff = asOf.getTime() - 60 * 86400000
  const recent = runs.filter(
    (r) =>
      !r.excluded_from_analysis &&
      r.distance > 0 &&
      r.moving_time > 0 &&
      new Date(r.start_date).getTime() >= cutoff &&
      new Date(r.start_date) < asOf,
  )
  const qualified = recent.filter(
    (r) => confirmedRace(r) || QUALITY.has(r.run_type ?? ''),
  )
  const points: BestEffortPoint[] = []
  for (const run of qualified) {
    const race = confirmedRace(run)
    const totalSecs = race
      ? (run.official_result_secs ?? run.elapsed_time)
      : run.moving_time
    const selected = efforts.filter(
      (e) =>
        e.activity_id === run.id &&
        e.duration_secs >= 180 &&
        e.best_pace_sec_per_km > 120 &&
        e.best_pace_sec_per_km < 1200,
    )
    const candidates = (race ? [] : selected).map((e) => ({
      durationSecs: e.duration_secs,
      paceSecPerKm: e.best_pace_sec_per_km,
    }))
    // Whole easy portions of a workout are not maximal observations.
    if (
      totalSecs &&
      (race ||
        (run.moving_time >= 1200 &&
          ['threshold', 'tempo'].includes(run.run_type ?? '')))
    )
      candidates.push({
        durationSecs: totalSecs,
        paceSecPerKm: totalSecs / (run.distance / 1000),
      })
    const recency = Math.pow(
      0.5,
      (asOf.getTime() - new Date(run.start_date).getTime()) / (30 * 86400000),
    )
    for (const c of candidates)
      points.push({
        ...c,
        date: run.start_date,
        activityId: run.id,
        weight:
          (recency * analysisWeightForActivity(run) * (race ? 3 : 1)) /
          Math.max(1, candidates.length),
      })
  }
  const distinct = new Set(points.map((p) => p.activityId)).size
  const fit =
    distinct >= 3 && new Set(points.map((p) => p.durationSecs)).size >= 3
      ? fitCriticalPace(points, true, calibration.huberDelta)
      : null
  return KEYS.map((key) => {
    const km = distanceKm(key)
    const anchors = qualified
      .filter(
        (r) =>
          confirmedRace(r) &&
          Math.abs(r.distance / 1000 / km - 1) < 0.03 &&
          (r.official_result_secs ?? r.elapsed_time ?? 0) > 0,
      )
      .sort((a, b) => b.start_date.localeCompare(a.start_date))
    const anchor = anchors[0]
    const maxDuration = Math.max(0, ...points.map((p) => p.durationSecs))
    const longest = Math.max(0, ...recent.map((r) => r.distance / 1000))
    const predicted = fit ? predictTimeForDistance(fit, km * 1000) : null
    const enoughLong =
      key === 'fm'
        ? longest >= 25 && maxDuration >= 3600
        : key === 'hm'
          ? longest >= 14 && maxDuration >= 1800
          : true
    const usable =
      predicted != null &&
      Number.isFinite(predicted) &&
      enoughLong &&
      maxDuration >= predicted * 0.25
    // Observed curve is in training conditions; normalize once, then apply today's conditions.
    const endurancePenalty =
      key === 'fm'
        ? 1 + 0.15 * (1 - Math.min(1, longest / 35))
        : key === 'hm'
          ? 1 + 0.08 * (1 - Math.min(1, longest / 25))
          : 1
    let ideal = usable
      ? (predicted! * endurancePenalty) / heatCost(usualWbgt, key)
      : null
    if (anchor) {
      const actual =
        ((anchor.official_result_secs ?? anchor.elapsed_time!) *
          Math.pow(km / (anchor.distance / 1000), 1.06)) /
        heatCost(anchor.wbgt, key)
      const age =
        (asOf.getTime() - new Date(anchor.start_date).getTime()) / 86400000
      const weight = Math.max(0.5, calibration.raceWeight - age / 150)
      ideal = ideal == null ? actual : weight * actual + (1 - weight) * ideal
    }
    const evidence = (
      anchor
        ? [anchor, ...qualified.filter((r) => r.id !== anchor.id)]
        : qualified
    )
      .filter(
        (r) => anchor?.id === r.id || points.some((p) => p.activityId === r.id),
      )
      .map((r) => ({
        activityId: r.id,
        date: r.start_date,
        kind: confirmedRace(r) ? 'confirmed race' : 'observed quality effort',
      }))
    const longExtrapolation =
      !anchor &&
      (key === 'fm' ||
        key === 'hm' ||
        maxDuration < (predicted ?? Infinity) * 0.6)
    const confidence =
      anchor && distinct >= 3
        ? 'high'
        : ideal != null && distinct >= 3 && !longExtrapolation
          ? 'medium'
          : 'low'
    const band =
      confidence === 'high' ? 0.05 : confidence === 'medium' ? 0.08 : 0.15
    const expected = ideal == null ? null : ideal * heatCost(usualWbgt, key)
    return {
      distanceKey: key,
      expectedSecs: expected,
      idealSecs: ideal,
      lowSecs: expected == null ? null : expected * (1 - band),
      highSecs: expected == null ? null : expected * (1 + band),
      confidence,
      status: expected == null ? 'insufficient_evidence' : 'ready',
      evidence,
      freshness: {
        latestEvidenceAt:
          evidence
            .map((e) => e.date)
            .sort()
            .at(-1) ?? null,
        ageDays: evidence.length
          ? Math.floor(
              (asOf.getTime() -
                Math.max(...evidence.map((e) => Date.parse(e.date)))) /
                86400000,
            )
          : null,
      },
      asOf: asOf.toISOString(),
      modelVersion: EXPECTED_MODEL_VERSION,
      explanation:
        expected == null
          ? 'More sustained quality efforts or a confirmed race are needed at this distance.'
          : `${anchor ? 'Anchored to your recent confirmed race.' : 'Based on observed quality efforts without hypothetical HR speed gains.'} ${longExtrapolation ? 'Long-distance extrapolation widens the range. ' : ''}${usualWbgt == null ? 'Weather unavailable; no heat adjustment applied. ' : 'Usual recent conditions applied once. '}Range is an estimate, not a calibrated probability.`,
    }
  })
}
