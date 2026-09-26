import { supabaseAdmin } from '../supabase'
import {
  type CPFitResult,
} from './criticalPace'
import { loadAthleteFeatures, type AthleteFeatures } from './features'
import { DEFAULT_MAX_HR } from './physiology'
import { project, type DistanceProjection, type AmbientHint, type ProvenRaceAnchor } from './projector'
import { raceClockEvidence, performanceCutoff, type EvidenceStreams, RACE_DISTANCE_METERS } from './performanceEvidence'
import { canonicalRaceDistanceKey, fitPerformanceCorpus } from './cpCorpus'
import { raceCalibrationEnabled, marathonEnduranceEnabled } from './personalization'
import { loadAthleteCalibration } from './calibration-service'
import { fetchAllPages } from '@/lib/fetchAllPages'

/**
 * Orchestrates the new race-time engine: CP fit + features + conditions →
 * per-distance projections. Single async entry point for callers; pulls data
 * from `activity_best_efforts` / `activity_conditions` / `activities`.
 */

const RECENT_TRAINING_DAYS = 60
// Explicit pagination avoids PostgREST's 1,000-row truncation as history grows.
async function pages(query: () => any): Promise<any[]> {
  try {
    return await fetchAllPages(query)
  } catch (error: any) {
    throw new Error(`Performance evidence read failed: ${error?.code}`)
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
export interface ProjectAthleteResult {
  fit: CPFitResult
  features: AthleteFeatures
  currentConditions: AmbientHint | null
  projections: DistanceProjection[]
}

export async function fitForAthlete(
  athleteId: number,
  windowDays?: number,
  asOf = new Date(),
): Promise<CPFitResult | null> {
  const cutoffISO = performanceCutoff(asOf, windowDays)
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
  const conditions = await conditionsFor(athleteId, activities.filter(a => !a.excluded_from_analysis).map(a => a.id))
  return fitPerformanceCorpus({ runs: activities, efforts: data, conditions, maxHr }, asOf, windowDays)
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
  const asOf = new Date()
  const [fit, features, currentConditions, raceAnchors, calibration] = await Promise.all([
    fitForAthlete(athleteId, windowDays, asOf),
    loadAthleteFeatures(athleteId, RECENT_TRAINING_DAYS, asOf),
    loadRecentTypicalConditions(athleteId),
    loadRecentRaceAnchors(athleteId, windowDays),
    raceCalibrationEnabled() ? loadAthleteCalibration(athleteId, asOf) : Promise.resolve(undefined),
  ])
  if (!fit) return null
  const projections = project({ fit, features, currentConditions, raceAnchors, calibration, useMarathonEndurance: marathonEnduranceEnabled() })
  return { fit, features, currentConditions, projections }
}

export function isCPEngineEnabled(): boolean {
  const v = process.env.USE_CP_ENGINE
  return v !== 'false' && v !== '0'
}
