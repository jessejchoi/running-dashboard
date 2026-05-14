import { subMonths } from 'date-fns'
import { supabaseAdmin } from '@/lib/supabase'
import { type DistanceKey } from '@/lib/goals'
import { analyzeAllAndCombine, type CombinedEstimate } from '@/lib/analysis'
import { ANALYSIS_ACTIVITY_COLUMNS, ANALYSIS_RUN_TYPES, DISTANCE_KEYS } from './constants'

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

export async function fetchAthleteAnalysisInputs(
  athleteId: number,
  options: AthleteAnalysisOptions = {},
): Promise<AnalysisInputs> {
  const activityColumns = options.activityColumns ?? ANALYSIS_ACTIVITY_COLUMNS

  const [{ data: goalRows }, { data: userProfile }] = await Promise.all([
    supabaseAdmin.from('user_goals').select('distance_key, target_secs').eq('athlete_id', athleteId),
    supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', athleteId).maybeSingle(),
  ])

  const targetSecsMap: Record<string, number> = {}
  for (const goal of goalRows ?? []) {
    targetSecsMap[goal.distance_key] = goal.target_secs
  }

  let intervalQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.intervals).order('start_date', { ascending: false })
  let thresholdQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.threshold).order('start_date', { ascending: false })
  let longQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.long).order('start_date', { ascending: false })
  let easyQuery = supabaseAdmin.from('activities').select(activityColumns).eq('athlete_id', athleteId).in('run_type', ANALYSIS_RUN_TYPES.easy).order('start_date', { ascending: false })
  let allActivitiesQuery = supabaseAdmin.from('activities').select('start_date, run_type, distance').eq('athlete_id', athleteId).eq('type', 'Run').not('run_type', 'is', null).order('start_date', { ascending: false })

  if (options.easyLookbackMonths) {
    easyQuery = easyQuery.gte('start_date', subMonths(new Date(), options.easyLookbackMonths).toISOString())
  }

  intervalQuery = applyLimit(intervalQuery, options.intervalLimit)
  thresholdQuery = applyLimit(thresholdQuery, options.thresholdLimit)
  longQuery = applyLimit(longQuery, options.longLimit)
  easyQuery = applyLimit(easyQuery, options.easyLimit)
  allActivitiesQuery = applyLimit(allActivitiesQuery, options.allActivitiesLimit)

  const [{ data: intervalRuns }, { data: thresholdRuns }, { data: longRuns }, { data: easyRuns }, { data: allActivities }] = await Promise.all([
    intervalQuery,
    thresholdQuery,
    longQuery,
    easyQuery,
    allActivitiesQuery,
  ])

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
    intervalRuns: intervalRuns ?? [],
    thresholdRuns: thresholdRuns ?? [],
    longRuns: longRuns ?? [],
    easyRuns: easyRuns ?? [],
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
  const currentEstimates = currentEstimatesFromResult(result)

  return {
    inputs,
    result,
    currentEstimates,
    combinedJson: JSON.parse(JSON.stringify(result.combined)) as Record<DistanceKey, CombinedEstimate | null>,
    targetSecsMap: inputs.targetSecsMap,
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
