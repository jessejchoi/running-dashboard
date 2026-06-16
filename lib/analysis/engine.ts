/**
 * Multi-distance race time estimation engine.
 */

import {
  type CombinedEstimate,
  type DistanceKey,
  type EasyRunEfficiency,
  type FiveKEstimate,
  type LongRunAnalysis,
  type RaceEstimate,
  type RaceResultAnalysis,
} from './types'
import { calcVdot, formatPace, formatTime } from './formatting'
import { DEFAULT_MAX_HR } from './physiology'
import { analyzeAllIntervalSessions } from './intervals'
import { analyzeThresholdSession } from './threshold'
import { analyzeLongRun } from './longRuns'
import { detectAndAnalyzeRace } from './races'
import {
  analyzeAllEasyRuns,
  easyRunToRaceEstimates,
  longRunSteadyEfficiencyPoints,
} from './easyRuns'
import { combineEstimates } from './combine'
import { analysisWeightForActivity } from '@/lib/run-classification'

export type {
  ActivityAnalysis,
  CombinedEstimate,
  DistanceKey,
  DriftWindow,
  EasyRunEfficiency,
  EstimateSource,
  FastBlock,
  FiveKEstimate,
  LongRunAnalysis,
  LongRunStructure,
  RaceEstimate,
  RaceResultAnalysis,
  RecoveryLap,
  RepDriftResult,
  RepEffort,
} from './types'
export { calcVdot, formatPace, formatTime } from './formatting'
export { DISTANCE_KM, riegelProject } from './riegel'
export { analyzeIntervalSession, analyzeAllIntervalSessions } from './intervals'
export { analyzeThresholdSession } from './threshold'
export {
  analyzeEasyRun,
  analyzeAllEasyRuns,
  analyzeAllEasyRunsWithReasons,
  easyRunTrendEstimate,
  longRunSteadyEfficiencyPoints,
} from './easyRuns'
export { analyzeLongRun } from './longRuns'
export { detectAndAnalyzeRace } from './races'
export { combineEstimates, getEffectiveWeights, getSourceWeight } from './combine'

function buildActivityLookup(activityGroups: any[][]): Map<number, any> {
  const byId = new Map<number, any>()
  for (const group of activityGroups) {
    for (const activity of group) {
      if (typeof activity?.id === 'number') byId.set(activity.id, activity)
    }
  }
  return byId
}

function applyActivityWeights(estimates: RaceEstimate[], activitiesById: Map<number, any>): RaceEstimate[] {
  return estimates.map(estimate => {
    const multiplier = analysisWeightForActivity(activitiesById.get(estimate.activityId))
    if (multiplier >= 1) return estimate
    return {
      ...estimate,
      confidence: estimate.confidence * multiplier,
      weightMultiplier: (estimate.weightMultiplier ?? 1) * multiplier,
      method: `${estimate.method} (treadmill signal, ${Math.round(multiplier * 100)}% weight)`,
    }
  })
}

/**
 * Run all analyzers and produce combined estimates for all distances.
 */
export function analyzeAllAndCombine(
  intervalActivities: any[],
  thresholdActivities: any[],
  longRunActivities: any[],
  easyActivities: any[],
  raceActivities: any[],
  maxHr: number = DEFAULT_MAX_HR,
  allActivities: { start_date: string; run_type?: string; distance?: number }[] = [],
): {
  intervalEstimates: FiveKEstimate[]
  thresholdEstimates: FiveKEstimate[]
  longRunAnalyses: LongRunAnalysis[]
  raceAnalyses: RaceResultAnalysis[]
  easyRunResults: EasyRunEfficiency[]
  longRunEfficiencyPoints: EasyRunEfficiency[]
  easyTrendEstimates: RaceEstimate[]
  allRaceEstimates: RaceEstimate[]
  combined: Record<DistanceKey, CombinedEstimate | null>
} {
  const intervalEstimates = analyzeAllIntervalSessions(
    intervalActivities.filter((a: any) => !a.excluded_from_analysis),
    maxHr,
  )

  const thresholdEstimatesBase = thresholdActivities
    .filter((a: any) => !a.excluded_from_analysis)
    .map(a => analyzeThresholdSession(a, maxHr))
    .filter(Boolean) as FiveKEstimate[]

  const longRunAnalyses = longRunActivities
    .filter((a: any) => !a.excluded_from_analysis)
    .map(a => analyzeLongRun(a, maxHr))
    .filter(Boolean) as LongRunAnalysis[]

  const fastBlockFiveKEstimates: FiveKEstimate[] = longRunAnalyses
    .filter(lr => lr.fastBlock && lr.fastBlockEstimates && lr.fastBlockEstimates.length > 0)
    .map(lr => {
      const est5k = lr.fastBlockEstimates!.find(e => e.distanceKey === '5k')
      if (!est5k) return null

      return {
        date: lr.date,
        activityId: lr.activityId,
        activityName: `${lr.activityName} (fast block)`,
        estimatedSecs: est5k.estimatedSecs,
        estimatedPace: formatPace(est5k.estimatedSecs / 5),
        estimatedTime: formatTime(est5k.estimatedSecs),
        vdot: calcVdot(est5k.estimatedSecs),
        workRestRatio: 1,
        correctionFactor: 0.80,
        totalWorkSecs: lr.fastBlock!.durationSecs,
        totalRestSecs: 0,
        effortsUsed: 1,
        allEfforts: [],
        recoveryLaps: [],
        isContinuous: true,
        raceEstimates: lr.fastBlockEstimates ?? [],
        isLongRunFastBlock: true,
      } as any as FiveKEstimate
    })
    .filter(Boolean) as FiveKEstimate[]

  const thresholdEstimates = [...thresholdEstimatesBase, ...fastBlockFiveKEstimates]

  const raceAnalyses = raceActivities
    .map(a => detectAndAnalyzeRace(a))
    .filter(Boolean) as RaceResultAnalysis[]

  const longRunEfficiencyPoints = longRunSteadyEfficiencyPoints(longRunAnalyses)
  const easyRunResultsBase = analyzeAllEasyRuns(
    easyActivities.filter((a: any) => !a.excluded_from_analysis),
  )
  const easyRunResults = [...easyRunResultsBase, ...longRunEfficiencyPoints]
  const easyTrendEstimates = easyRunResults
    .filter(r => !r.excludedReason)
    .flatMap(r => easyRunToRaceEstimates(r, maxHr))

  const activitiesById = buildActivityLookup([
    intervalActivities,
    thresholdActivities,
    longRunActivities,
    easyActivities,
    raceActivities,
  ])

  const allRaceEstimates: RaceEstimate[] = applyActivityWeights([
    ...intervalEstimates.flatMap(e => e.raceEstimates ?? []),
    ...thresholdEstimates.flatMap(e => e.raceEstimates ?? []),
    ...raceAnalyses.flatMap(e => e.raceEstimates),
    ...easyTrendEstimates,
  ], activitiesById)

  const runsSinceRace: Record<DistanceKey, number> = {
    '5k': Infinity,
    '10k': Infinity,
    'hm': Infinity,
    'fm': Infinity,
  }

  for (const raceAnalysis of raceAnalyses) {
    const distanceKey = raceAnalysis.matchedDistanceKey
    const raceDate = raceAnalysis.date
    const count = allActivities.filter(a =>
      a.run_type && a.start_date.split('T')[0] > raceDate
    ).length

    if (count < runsSinceRace[distanceKey]) {
      runsSinceRace[distanceKey] = count
    }
  }

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0]
  const longestRecentRunKm = allActivities
    .filter(a => a.distance && a.start_date.split('T')[0] >= threeMonthsAgoStr)
    .reduce((max, a) => Math.max(max, (a.distance ?? 0) / 1000), 0)

  const combined: Record<DistanceKey, CombinedEstimate | null> = {
    '5k': combineEstimates(allRaceEstimates, '5k', runsSinceRace['5k'], longestRecentRunKm),
    '10k': combineEstimates(allRaceEstimates, '10k', runsSinceRace['10k'], longestRecentRunKm),
    'hm': combineEstimates(allRaceEstimates, 'hm', runsSinceRace['hm'], longestRecentRunKm),
    'fm': combineEstimates(allRaceEstimates, 'fm', runsSinceRace['fm'], longestRecentRunKm),
  }

  return {
    intervalEstimates,
    thresholdEstimates,
    longRunAnalyses,
    raceAnalyses,
    easyRunResults,
    longRunEfficiencyPoints,
    easyTrendEstimates,
    allRaceEstimates,
    combined,
  }
}
