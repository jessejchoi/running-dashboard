import { subMonths } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase'
import { type DistanceKey } from '@/lib/goals'
import { analyzeAllAndCombine, type CombinedEstimate } from '@/lib/analysis'
import { ANALYSIS_ACTIVITY_COLUMNS, ANALYSIS_RUN_TYPES, DISTANCE_KEYS } from './constants'
import { isCPEngineEnabled, projectAthleteRaceTimes, type ProjectAthleteResult } from './projector-service'
import type { SnapshotExtras } from '@/lib/estimateSnapshots'
import { categorizeRun, type PaceZones } from '@/lib/run-classification'

export type AnalysisResult = ReturnType<typeof analyzeAllAndCombine>

export interface AnalysisInputs {
  intervalRuns: any[]
  thresholdRuns: any[]
  longRuns: any[]
  easyRuns: any[]
  raceRuns: any[]
  allActivities: any[]
  maxHr: number
  hasMaxHr: boolean
  targetSecsMap: Record<string, number>
}

export interface AthleteAnalysisOptions {
  activityColumns?: string
  easyLookbackMonths?: number
  intervalLimit?: number
  thresholdLimit?: number
  longLimit?: number
  easyLimit?: number
  raceLimit?: number
  allActivitiesLimit?: number
}

export interface AthleteAnalysis {
  inputs: AnalysisInputs
  result: AnalysisResult
  currentEstimates: Record<string, number | null>
  combinedJson: Record<DistanceKey, CombinedEstimate | null>
  targetSecsMap: Record<string, number>
  /** Output of the new CP engine when USE_CP_ENGINE is on; null otherwise. */
  projection: ProjectAthleteResult | null
  /** Per-distance snapshot extras derived from `projection`. Pass to saveSnapshot. */
  snapshotExtras: Record<string, SnapshotExtras> | null
}

export function emptyAnalysisResult(): AnalysisResult {
  return {
    intervalEstimates: [],
    thresholdEstimates: [],
    longRunAnalyses: [],
    raceAnalyses: [],
    easyRunResults: [],
    longRunEfficiencyPoints: [],
    easyTrendEstimates: [],
    allRaceEstimates: [],
    combined: { '5k': null, '10k': null, 'hm': null, 'fm': null },
  }
}

export function currentEstimatesFromResult(result: AnalysisResult): Record<string, number | null> {
  return {
    '5k': result.combined['5k']?.bestEstimateSecs ?? null,
    '10k': result.combined['10k']?.bestEstimateSecs ?? null,
    'hm': result.combined['hm']?.bestEstimateSecs ?? null,
    'fm': result.combined['fm']?.bestEstimateSecs ?? null,
  }
}

export function roundedCurrentEstimates(result: AnalysisResult): Record<string, number | null> {
  const estimates = currentEstimatesFromResult(result)
  return Object.fromEntries(
    Object.entries(estimates).map(([key, value]) => [key, value == null ? null : Math.round(value)])
  )
}

function applyLimit<T>(query: T, limit?: number): T {
  return typeof limit === 'number' ? (query as any).limit(limit) : query
}

function analysisRunTypeForActivity(activity: any, zones: PaceZones | null, maxHr?: number): string | null {
  if (activity.run_type !== 'treadmill') return activity.run_type ?? null
  if (!activity.average_speed || !activity.distance) return null

  return categorizeRun({
    distance: activity.distance,
    average_speed: activity.average_speed,
    average_heartrate: activity.average_heartrate ?? undefined,
    suffer_score: activity.suffer_score ?? undefined,
    laps: activity.laps ?? [],
    splits: activity.splits ?? [],
  }, zones ?? undefined, maxHr)
}

function appendLegacyTreadmillRuns(
  buckets: Pick<AnalysisInputs, 'intervalRuns' | 'thresholdRuns' | 'longRuns' | 'easyRuns'>,
  activities: any[],
  zones: PaceZones | null,
  maxHr?: number,
  easyCutoffISO?: string,
) {
  for (const activity of activities) {
    if (activity.is_race || activity.excluded_from_analysis) continue
    const runType = analysisRunTypeForActivity(activity, zones, maxHr)
    if (!runType) continue

    const syntheticActivity = {
      ...activity,
      run_type: runType,
      trainer: true,
      raw: { ...(activity.raw ?? {}), trainer: true },
    }
    if ((ANALYSIS_RUN_TYPES.intervals as readonly string[]).includes(runType)) {
      buckets.intervalRuns.push(syntheticActivity)
    } else if ((ANALYSIS_RUN_TYPES.threshold as readonly string[]).includes(runType)) {
      buckets.thresholdRuns.push(syntheticActivity)
    } else if ((ANALYSIS_RUN_TYPES.long as readonly string[]).includes(runType)) {
      buckets.longRuns.push(syntheticActivity)
    } else if ((ANALYSIS_RUN_TYPES.easy as readonly string[]).includes(runType)) {
      if (!easyCutoffISO || String(activity.start_date) >= easyCutoffISO) {
        buckets.easyRuns.push(syntheticActivity)
      }
    }
  }
}

function finalizeRuns<T extends { start_date?: string | null }>(runs: T[], limit?: number): T[] {
  const sorted = [...runs].sort((a, b) => String(b.start_date ?? '').localeCompare(String(a.start_date ?? '')))
  return typeof limit === 'number' ? sorted.slice(0, limit) : sorted
}

export async function fetchAthleteAnalysisInputs(
  athleteId: number,
  options: AthleteAnalysisOptions = {},
): Promise<AnalysisInputs> {
  const activityColumns = options.activityColumns ?? ANALYSIS_ACTIVITY_COLUMNS

  const [{ data: goalRows }, { data: userProfile }] = await Promise.all([
    supabaseAdmin.from('user_goals').select('distance_key, target_secs').eq('athlete_id', athleteId),
    supabaseAdmin.from('user_profiles').select('max_hr, pace_zones').eq('athlete_id', athleteId).maybeSingle(),
  ])

  const targetSecsMap: Record<string, number> = {}
  for (const goal of goalRows ?? []) {
    targetSecsMap[goal.distance_key] = goal.target_secs
  }

  let intervalQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.intervals).order('start_date', { ascending: false })
  let thresholdQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.threshold).order('start_date', { ascending: false })
  let longQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.long).order('start_date', { ascending: false })
  let easyQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.easy).order('start_date', { ascending: false })
  let legacyTreadmillQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).eq('type', 'Run').eq('run_type', 'treadmill').order('start_date', { ascending: false })
  let allActivitiesQuery = supabaseAdmin.from('activities').select('start_date, run_type, distance').eq('athlete_id', athleteId).eq('type', 'Run').not('run_type', 'is', null).order('start_date', { ascending: false })

  let easyCutoffISO: string | undefined
  if (options.easyLookbackMonths) {
    easyCutoffISO = subMonths(new Date(), options.easyLookbackMonths).toISOString()
    easyQuery = easyQuery.gte('start_date', easyCutoffISO)
  }

  intervalQuery = applyLimit(intervalQuery, options.intervalLimit)
  thresholdQuery = applyLimit(thresholdQuery, options.thresholdLimit)
  longQuery = applyLimit(longQuery, options.longLimit)
  easyQuery = applyLimit(easyQuery, options.easyLimit)
  allActivitiesQuery = applyLimit(allActivitiesQuery, options.allActivitiesLimit)

  const [
    { data: intervalRuns },
    { data: thresholdRuns },
    { data: longRuns },
    { data: easyRuns },
    { data: allActivities },
    { data: legacyTreadmillRuns },
  ] = await Promise.all([
    intervalQuery,
    thresholdQuery,
    longQuery,
    easyQuery,
    allActivitiesQuery,
    legacyTreadmillQuery,
  ])

  const buckets = {
    intervalRuns: [...((intervalRuns ?? []) as any[])],
    thresholdRuns: [...((thresholdRuns ?? []) as any[])],
    longRuns: [...((longRuns ?? []) as any[])],
    easyRuns: [...((easyRuns ?? []) as any[])],
  }
  appendLegacyTreadmillRuns(
    buckets,
    legacyTreadmillRuns ?? [],
    (userProfile?.pace_zones ?? null) as PaceZones | null,
    userProfile?.max_hr ?? undefined,
    easyCutoffISO,
  )

  let raceRuns: any[] = []
  try {
    let raceQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).eq('is_race', true).order('start_date', { ascending: false })
    raceQuery = applyLimit(raceQuery, options.raceLimit)
    const { data } = await raceQuery
    raceRuns = data ?? []
  } catch {
    // Older databases may not have is_race yet.
  }

  return {
    intervalRuns: finalizeRuns(buckets.intervalRuns, options.intervalLimit),
    thresholdRuns: finalizeRuns(buckets.thresholdRuns, options.thresholdLimit),
    longRuns: finalizeRuns(buckets.longRuns, options.longLimit),
    easyRuns: finalizeRuns(buckets.easyRuns, options.easyLimit),
    raceRuns,
    allActivities: allActivities ?? [],
    maxHr: userProfile?.max_hr ?? 195,
    hasMaxHr: userProfile?.max_hr != null,
    targetSecsMap,
  }
}

export function analyzeInputs(inputs: AnalysisInputs): AnalysisResult {
  try {
    return analyzeAllAndCombine(
      inputs.intervalRuns,
      inputs.thresholdRuns,
      inputs.longRuns,
      inputs.easyRuns,
      inputs.raceRuns,
      inputs.maxHr,
      inputs.allActivities,
    )
  } catch (err) {
    console.error('analyzeAllAndCombine failed:', err)
    return emptyAnalysisResult()
  }
}

export async function getAthleteAnalysis(
  athleteId: number,
  options: AthleteAnalysisOptions = {},
): Promise<AthleteAnalysis> {
  const inputs = await fetchAthleteAnalysisInputs(athleteId, options)
  const result = analyzeInputs(inputs)
  let currentEstimates = currentEstimatesFromResult(result)

  // The old per-source engine always runs — its `combined` output still feeds
  // the existing UI's source breakdown. The new CP engine, when enabled, takes
  // over the primary `currentEstimates` and produces structured snapshot extras.
  let projection: ProjectAthleteResult | null = null
  let snapshotExtras: Record<string, SnapshotExtras> | null = null
  if (isCPEngineEnabled()) {
    try {
      projection = await projectAthleteRaceTimes(athleteId)
    } catch (err) {
      console.error('CP engine failed; falling back to legacy estimates:', err)
    }
    if (projection) {
      currentEstimates = {
        '5k':  projection.projections.find(p => p.distanceKey === '5k')?.idealSecs  ?? null,
        '10k': projection.projections.find(p => p.distanceKey === '10k')?.idealSecs ?? null,
        'hm':  projection.projections.find(p => p.distanceKey === 'hm')?.idealSecs  ?? null,
        'fm':  projection.projections.find(p => p.distanceKey === 'fm')?.idealSecs  ?? null,
      }
      snapshotExtras = {}
      for (const p of projection.projections) {
        snapshotExtras[p.distanceKey] = {
          idealSecs:   p.idealSecs,
          todaySecs:   p.todaySecs,
          p80LowSecs:  p.p80SecsLow,
          p80HighSecs: p.p80SecsHigh,
        }
      }
    }
  }

  return {
    inputs,
    result,
    currentEstimates,
    combinedJson: JSON.parse(JSON.stringify(result.combined)) as Record<DistanceKey, CombinedEstimate | null>,
    targetSecsMap: inputs.targetSecsMap,
    projection,
    snapshotExtras,
  }
}

export function sourceCountsByDistance(result: AnalysisResult): Record<string, Record<string, number>> {
  const sourceCounts: Record<string, Record<string, number>> = {}

  for (const distanceKey of DISTANCE_KEYS) {
    const combined = result.combined[distanceKey]
    if (!combined) continue

    const counts: Record<string, number> = {}
    for (const contributor of combined.contributors) {
      counts[contributor.source] = (counts[contributor.source] ?? 0) + 1
    }
    sourceCounts[distanceKey] = counts
  }

  return sourceCounts
}

export function confidenceByDistance(result: AnalysisResult): Record<string, number> {
  const confidence: Record<string, number> = {}

  for (const distanceKey of DISTANCE_KEYS) {
    const combined = result.combined[distanceKey]
    if (combined) confidence[distanceKey] = combined.confidence
  }

  return confidence
}
