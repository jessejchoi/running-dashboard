import { supabaseAdmin } from '../supabase'
import {
  adjustBestEffortsToRaceHR,
  fitCriticalPace,
  type CPFitResult,
  type BestEffortPoint,
} from './criticalPace'
import { loadAthleteFeatures, type AthleteFeatures } from './features'
import { DEFAULT_MAX_HR } from './physiology'
import { project, type DistanceProjection, type AmbientHint, type ProvenRaceAnchor } from './projector'
import { raceClockEvidence, performanceCutoff, performanceHeatMultiplier, type EvidenceStreams, RACE_DISTANCE_METERS } from './performanceEvidence'
import { distanceKm, type DistanceKey } from '@/lib/goals'
import { analysisWeightForActivity } from '@/lib/run-classification'

/**
 * Orchestrates the new race-time engine: CP fit + features + conditions →
 * per-distance projections. Single async entry point for callers; pulls data
 * from `activity_best_efforts` / `activity_conditions` / `activities`.
 */

const RECENT_TRAINING_DAYS = 60
const PAGE_SIZE = 500

// Explicit pagination avoids PostgREST's 1,000-row truncation as history grows.
async function pages(query: () => any): Promise<any[]> {
  const rows: any[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await query().range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`Performance evidence read failed: ${error.code}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function conditionsFor(athleteId: number, ids: number[]): Promise<Map<number, any>> {
  const byId = new Map<number, any>()
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabaseAdmin.from('activity_conditions')
      .select('activity_id, temp_c, wbgt_approx_c').eq('athlete_id', athleteId).in('activity_id', ids.slice(offset, offset + 200))
    if (error) throw new Error(`Performance weather read failed: ${error.code}`)
    for (const row of data ?? []) byId.set(row.activity_id, row)
  }
  return byId
}
const RECENT_CONDITIONS_DAYS = 7
const RACE_TOTAL_POINT_WEIGHT = 200
const QUALITY_TOTAL_RUN_TYPES = new Set(['threshold', 'tempo', 'long_progressive'])
const RACE_DISTANCE_TOLERANCE: Record<DistanceKey, number> = {
  '5k': 0.08,
  '10k': 0.08,
  'hm': 0.06,
  'fm': 0.04,
}

function shouldUseTotalActivityPoint(activity: any): boolean {
  if (activity.is_race || activity.run_type === 'race') return true
  if (activity.moving_time > 5400) return true
  if (!QUALITY_TOTAL_RUN_TYPES.has(activity.run_type)) return false
  return activity.moving_time >= 1200 && activity.distance >= 5000
}

export interface ProjectAthleteResult {
  fit: CPFitResult
  features: AthleteFeatures
  currentConditions: AmbientHint | null
  projections: DistanceProjection[]
}

function canonicalRaceDistanceKey(activityKm: number): DistanceKey | null {
  let best: { key: DistanceKey; gap: number } | null = null
  for (const key of ['5k', '10k', 'hm', 'fm'] as DistanceKey[]) {
    const targetKm = distanceKm(key)
    const gap = Math.abs(activityKm / targetKm - 1)
    if (gap <= RACE_DISTANCE_TOLERANCE[key] && (!best || gap < best.gap)) {
      best = { key, gap }
    }
  }
  return best?.key ?? null
}

export async function fitForAthlete(
  athleteId: number,
  windowDays?: number,
): Promise<CPFitResult | null> {
  const asOf = new Date(), cutoffISO = performanceCutoff(asOf, windowDays)
  const [data, activities, profile] = await Promise.all([
    pages(() => supabaseAdmin.from('activity_best_efforts')
      .select('duration_secs, best_pace_sec_per_km, avg_hr, activity_start_date, activity_id')
      .eq('athlete_id', athleteId).gte('activity_start_date', cutoffISO).lte('activity_start_date', asOf.toISOString())
      .order('activity_id').order('duration_secs')),
    pages(() => supabaseAdmin.from('activities')
      .select('id, start_date, distance, moving_time, elapsed_time, official_result_secs, average_heartrate, run_type, is_race, excluded_from_analysis, trainer:raw->trainer, sport_type:raw->sport_type')
      .eq('athlete_id', athleteId).eq('type', 'Run').gte('start_date', cutoffISO).lte('start_date', asOf.toISOString())
      .order('start_date').order('id')),
    supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', athleteId).maybeSingle(),
  ])
  if (profile.error) throw new Error(`Performance profile read failed: ${profile.error.code}`)
  const maxHr = profile.data?.max_hr ?? DEFAULT_MAX_HR
  const included = activities.filter(a => !a.excluded_from_analysis)
  const activitiesById = new Map(included.map(a => [a.id, a]))
  const conditions = await conditionsFor(athleteId, included.map(a => a.id))
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

/**
 * Average conditions across the athlete's runs in the last week. Represents
 * the user's "current acclimation baseline" — what conditions has their body
 * been working in lately. Drives the today-multiplier in the projector.
 */
export async function loadRecentTypicalConditions(athleteId: number): Promise<AmbientHint | null> {
  const cutoffISO = new Date(Date.now() - RECENT_CONDITIONS_DAYS * 86_400_000).toISOString()
  const { data: recentRuns } = await supabaseAdmin
    .from('activities')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .gte('start_date', cutoffISO)
  if (!recentRuns?.length) return null

  const ids = recentRuns.map((r: any) => r.id)
  const { data: conditions } = await supabaseAdmin
    .from('activity_conditions')
    .select('temp_c, wbgt_approx_c')
    .in('activity_id', ids)
  if (!conditions?.length) return null

  const wbgts = conditions.map((c: any) => c.wbgt_approx_c).filter((v: any): v is number => typeof v === 'number')
  const temps = conditions.map((c: any) => c.temp_c).filter((v: any): v is number => typeof v === 'number')
  if (wbgts.length === 0 && temps.length === 0) return null
  return {
    tempC: temps.length ? temps.reduce((s, v) => s + v, 0) / temps.length : null,
    wbgtApproxC: wbgts.length ? wbgts.reduce((s, v) => s + v, 0) / wbgts.length : null,
  }
}

export async function loadRecentRaceAnchors(
  athleteId: number,
  windowDays?: number,
): Promise<ProvenRaceAnchor[]> {
  const asOf = new Date(), cutoffISO = performanceCutoff(asOf, windowDays)
  const races = await pages(() => supabaseAdmin.from('activities')
    .select('id, start_date, distance, elapsed_time, official_result_secs, excluded_from_analysis')
    .eq('athlete_id', athleteId).eq('type', 'Run').gte('start_date', cutoffISO).lte('start_date', asOf.toISOString())
    .or('is_race.eq.true,run_type.eq.race').order('start_date').order('id'))
  const included = races.filter(r => !r.excluded_from_analysis && canonicalRaceDistanceKey(r.distance / 1000))
  const conditions = await conditionsFor(athleteId, included.map(r => r.id))
  const anchors: ProvenRaceAnchor[] = []
  // Only confirmed race streams, in small batches; never enrich the archive or
  // transfer coordinates/HR streams to build these distance/terrain constraints.
  for (let offset = 0; offset < included.length; offset += 10) {
    const batch = included.slice(offset, offset + 10)
    const { data, error } = await supabaseAdmin.from('activities')
      .select('id, time:streams->time, distance_stream:streams->distance, grade:streams->grade_smooth')
      .eq('athlete_id', athleteId).in('id', batch.map(r => r.id))
    if (error) throw new Error(`Race stream read failed: ${error.code}`)
    const streamsById = new Map((data ?? []).map((r: any) => [r.id, { time: r.time, distance: r.distance_stream, grade_smooth: r.grade }]))
    for (const race of batch) {
      const key = canonicalRaceDistanceKey(race.distance / 1000)!
      const streams: EvidenceStreams = streamsById.get(race.id) ?? {}
      const clock = raceClockEvidence(streams, RACE_DISTANCE_METERS[key], race.elapsed_time, race.official_result_secs, race.distance)
      if (!clock) continue
      const condition = conditions.get(race.id)
      anchors.push({ distanceKey: key, ...clock, activityId: race.id, date: race.start_date,
        conditions: condition ? { tempC: condition.temp_c, wbgtApproxC: condition.wbgt_approx_c } : null })
    }
  }
  return anchors
}

export async function projectAthleteRaceTimes(
  athleteId: number,
  windowDays?: number,
): Promise<ProjectAthleteResult | null> {
  const [fit, features, currentConditions, raceAnchors] = await Promise.all([
    fitForAthlete(athleteId, windowDays),
    loadAthleteFeatures(athleteId, RECENT_TRAINING_DAYS),
    loadRecentTypicalConditions(athleteId),
    loadRecentRaceAnchors(athleteId, windowDays),
  ])
  if (!fit) return null
  const projections = project({ fit, features, currentConditions, raceAnchors })
  return { fit, features, currentConditions, projections }
}

export function isCPEngineEnabled(): boolean {
  const v = process.env.USE_CP_ENGINE
  return v !== 'false' && v !== '0'
}
