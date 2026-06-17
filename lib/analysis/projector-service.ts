import { supabaseAdmin } from '../supabase'
import {
  adjustBestEffortsToRaceHR,
  fitCriticalPace,
  type CPFitResult,
  type BestEffortPoint,
} from './criticalPace'
import { loadAthleteFeatures, type AthleteFeatures } from './features'
import { DEFAULT_MAX_HR } from './physiology'
import { project, type DistanceProjection, type AmbientHint } from './projector'
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

export async function projectAthleteRaceTimes(
  athleteId: number,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<ProjectAthleteResult | null> {
  const [fit, features, currentConditions] = await Promise.all([
    fitForAthlete(athleteId, windowDays),
    loadAthleteFeatures(athleteId, windowDays),
    loadRecentTypicalConditions(athleteId),
  ])
  if (!fit) return null
  const projections = project({ fit, features, currentConditions })
  return { fit, features, currentConditions, projections }
}

export function isCPEngineEnabled(): boolean {
  const v = process.env.USE_CP_ENGINE
  return v !== 'false' && v !== '0'
}
