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
import { riegelProject } from './riegel'
import { distanceKm, type DistanceKey } from '@/lib/goals'
import { analysisWeightForActivity } from '@/lib/run-classification'

/**
 * Orchestrates the new race-time engine: CP fit + features + conditions →
 * per-distance projections. Single async entry point for callers; pulls data
 * from `activity_best_efforts` / `activity_conditions` / `activities`.
 */

const DEFAULT_WINDOW_DAYS = 60
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
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<CPFitResult | null> {
  const cutoffISO = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const [{ data }, { data: userProfile }] = await Promise.all([
    supabaseAdmin
      .from('activity_best_efforts')
      .select('duration_secs, best_pace_sec_per_km, avg_hr, activity_start_date, activity_id')
      .eq('athlete_id', athleteId)
      .gte('activity_start_date', cutoffISO),
    supabaseAdmin
      .from('user_profiles')
      .select('max_hr')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
  ])
  const maxHr = userProfile?.max_hr ?? DEFAULT_MAX_HR

  const { data: activities } = await supabaseAdmin
    .from('activities')
    .select('id, start_date, distance, moving_time, average_heartrate, run_type, is_race, excluded_from_analysis, raw')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .gte('start_date', cutoffISO)
  const activitiesById = new Map((activities ?? []).map((activity: any) => [activity.id, activity]))

  const cachedPoints: BestEffortPoint[] = (data ?? []).map((d: any) => ({
    durationSecs: d.duration_secs,
    paceSecPerKm: d.best_pace_sec_per_km,
    avgHR: d.avg_hr,
    date: String(d.activity_start_date).slice(0, 10),
    activityId: d.activity_id,
    weight: analysisWeightForActivity(activitiesById.get(d.activity_id)),
  }))

  const totalPoints: BestEffortPoint[] = (activities ?? [])
    .filter((activity: any) => !activity.excluded_from_analysis)
    .filter((activity: any) => activity.distance > 0 && activity.moving_time >= 180)
    .filter(shouldUseTotalActivityPoint)
    .map((activity: any) => {
      const isRace = activity.is_race || activity.run_type === 'race'
      const baseWeight = analysisWeightForActivity(activity)
      return {
        durationSecs: activity.moving_time,
        paceSecPerKm: activity.moving_time / (activity.distance / 1000),
        avgHR: activity.average_heartrate,
        date: String(activity.start_date).slice(0, 10),
        activityId: activity.id,
        weight: baseWeight * (isRace ? RACE_TOTAL_POINT_WEIGHT : 1),
      }
    })

  const points = adjustBestEffortsToRaceHR([...cachedPoints, ...totalPoints], maxHr)
  return fitCriticalPace(points)
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
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<ProvenRaceAnchor[]> {
  const cutoffISO = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const { data: races } = await supabaseAdmin
    .from('activities')
    .select('id, distance, moving_time')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .gte('start_date', cutoffISO)
    .or('is_race.eq.true,run_type.eq.race')
    .neq('excluded_from_analysis', true)
  if (!races?.length) return []

  const ids = races.map((race: any) => race.id)
  const [{ data: conditions }, { data: raceBestEfforts }] = await Promise.all([
    supabaseAdmin
      .from('activity_conditions')
      .select('activity_id, temp_c, wbgt_approx_c')
      .in('activity_id', ids),
    supabaseAdmin
      .from('activity_best_efforts')
      .select('activity_id, duration_secs, best_pace_sec_per_km')
      .in('activity_id', ids),
  ])
  const conditionsById = new Map((conditions ?? []).map((row: any) => [row.activity_id, row]))
  const bestEffortsByActivityId = new Map<number, any[]>()
  for (const effort of raceBestEfforts ?? []) {
    const activityId = effort.activity_id as number
    bestEffortsByActivityId.set(activityId, [
      ...(bestEffortsByActivityId.get(activityId) ?? []),
      effort,
    ])
  }

  const bestByDistance = new Map<DistanceKey, ProvenRaceAnchor>()
  for (const race of races) {
    if (!race.distance || !race.moving_time) continue
    const activityKm = race.distance / 1000
    const key = canonicalRaceDistanceKey(activityKm)
    if (!key) continue

    const targetKm = distanceKm(key)
    const totalObservedSecs = riegelProject(race.moving_time, activityKm, targetKm)
    const segmentObservedSecs = (bestEffortsByActivityId.get(race.id) ?? [])
      .map((effort: any) => {
        const effortKm = effort.duration_secs / effort.best_pace_sec_per_km
        if (effortKm < targetKm * 0.85 || effortKm > targetKm * 1.20) return null
        return riegelProject(effort.duration_secs, effortKm, targetKm)
      })
      .filter((secs: number | null): secs is number => secs != null && Number.isFinite(secs))
      .sort((a: number, b: number) => a - b)[0]
    const observedSecs = Math.min(totalObservedSecs, segmentObservedSecs ?? Infinity)
    const condition = conditionsById.get(race.id)
    const anchor: ProvenRaceAnchor = {
      distanceKey: key,
      observedSecs,
      conditions: condition ? {
        tempC: condition.temp_c,
        wbgtApproxC: condition.wbgt_approx_c,
      } : null,
    }

    const current = bestByDistance.get(key)
    if (!current || anchor.observedSecs < current.observedSecs) {
      bestByDistance.set(key, anchor)
    }
  }

  return Array.from(bestByDistance.values())
}

export async function projectAthleteRaceTimes(
  athleteId: number,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<ProjectAthleteResult | null> {
  const [fit, features, currentConditions, raceAnchors] = await Promise.all([
    fitForAthlete(athleteId, windowDays),
    loadAthleteFeatures(athleteId, windowDays),
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
