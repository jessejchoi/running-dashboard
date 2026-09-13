import { adjustBestEffortsToRaceHR, fitCriticalPace, type BestEffortPoint } from './criticalPace'
import { performanceCutoff, performanceHeatMultiplier, RACE_DISTANCE_METERS } from './performanceEvidence'
import { analysisWeightForActivity } from '@/lib/run-classification'
import { distanceKm, type DistanceKey } from '@/lib/goals'

export interface PerformanceCorpus { runs: any[]; efforts: any[]; conditions: Map<number, any>; maxHr: number }
export function canonicalRaceDistanceKey(activityKm: number): DistanceKey | null {
  let best: { key: DistanceKey; gap: number } | null = null
  for (const key of ['5k', '10k', 'hm', 'fm'] as DistanceKey[]) {
    const gap = Math.abs(activityKm / distanceKm(key) - 1)
    if (gap <= { '5k': 0.08, '10k': 0.08, hm: 0.06, fm: 0.04 }[key] && (!best || gap < best.gap)) best = { key, gap }
  }
  return best?.key ?? null
}
function shouldUseTotalActivityPoint(a: any) {
  return a.is_race || a.run_type === 'race' || a.moving_time > 5400 ||
    (['threshold', 'tempo', 'long_progressive'].includes(a.run_type) && a.moving_time >= 1200 && a.distance >= 5000)
}
const RACE_TOTAL_POINT_WEIGHT = 200
export function fitPerformanceCorpus(corpus: PerformanceCorpus, asOf: Date, windowDays?: number) {
  const cutoff = Date.parse(performanceCutoff(asOf, windowDays))
  const activities = corpus.runs.filter(a => Date.parse(a.start_date) >= cutoff && Date.parse(a.start_date) < asOf.getTime())
  const { efforts: data, conditions, maxHr } = corpus
  const included = activities.filter(a => !a.excluded_from_analysis)
  const activitiesById = new Map(included.map(a => [a.id, a]))
  const cachedPoints: BestEffortPoint[] = data.filter(d => activitiesById.has(d.activity_id)).map(d => ({
    durationSecs: d.duration_secs,
    paceSecPerKm: d.best_pace_sec_per_km,
    avgHR: d.avg_hr,
    date: String(d.activity_start_date).slice(0, 10),
    activityId: d.activity_id,
    weight: analysisWeightForActivity(activitiesById.get(d.activity_id)),
  }))
  const totalPoints: BestEffortPoint[] = included.filter(shouldUseTotalActivityPoint).flatMap(activity => {
    const race = activity.is_race || activity.run_type === 'race'
    // Official times are tied to the event distance, not excess GPS distance.
    const canonical = race ? canonicalRaceDistanceKey(activity.distance / 1000) : null
    const seconds = race ? activity.official_result_secs ?? activity.elapsed_time : activity.moving_time
    const meters = activity.official_result_secs && canonical ? RACE_DISTANCE_METERS[canonical] : activity.distance
    if (!(meters > 0) || !(seconds >= 180)) return []
    return [{ durationSecs: seconds, paceSecPerKm: seconds / (meters / 1000), avgHR: activity.average_heartrate,
      date: String(activity.start_date).slice(0, 10), activityId: activity.id,
      weight: analysisWeightForActivity(activity) * (race ? RACE_TOTAL_POINT_WEIGHT : 1) }]
  })
  // Normalize each observed effort to cool conditions before fitting. Keep the
  // observed distance unchanged, and retain one point per original duration so
  // weather-adjusted timestamps don't let overlapping segments dominate the fit.
  const bestByDuration = new Map<number, BestEffortPoint>()
  for (const point of adjustBestEffortsToRaceHR([...cachedPoints, ...totalPoints], maxHr)) {
    if (!(point.paceSecPerKm > 0) || !Number.isFinite(point.paceSecPerKm)) continue
    const observedPace = point.observedPaceSecPerKm ?? point.paceSecPerKm
    const meters = point.durationSecs / observedPace * 1000
    const heat = performanceHeatMultiplier(conditions.get(point.activityId)?.wbgt_approx_c, meters)
    const normalized = { ...point, observedDurationSecs: point.durationSecs, durationSecs: point.durationSecs / heat, paceSecPerKm: point.paceSecPerKm / heat, adjustedPaceSecPerKm: point.paceSecPerKm / heat }
    const previous = bestByDuration.get(point.durationSecs)
    if (!previous || normalized.paceSecPerKm < previous.paceSecPerKm) bestByDuration.set(point.durationSecs, normalized)
  }
  return fitCriticalPace(Array.from(bestByDuration.values()))
}
