import { type FiveKEstimate, type RaceEstimate, type RecoveryLap, type RepEffort } from './types'
import { calcVdot, formatPace, formatTime } from './formatting'
import { riegelProject } from './riegel'
import { DEFAULT_MAX_HR, driftPenaltyMultiplier } from './physiology'
import { computeRepDrift, processLaps, restOnlyCorrection } from './laps'
import { runDay } from '@/lib/calendar'
const DANIELS_CONTINUOUS = 0.907
const DANIELS_STRUCTURED = 0.92
export const THRESHOLD_TO_10K = 0.96
export const THRESHOLD_TO_HM = 1.0
export const THRESHOLD_CONFIDENCE = { '5k': 0.70, '10k': 0.80, 'hm': 0.75, 'fm': 0.45 } as const
export // threshold ≈ HM race pace

/**
 * Continuous threshold Daniels ratio with HR adjustment.
 * ±0.003 per bpm deviation from expected threshold HR (88% max).
 * Clamped to [0.89, 0.95].
 */
function continuousDanielsRatio(avgHR?: number, maxHr: number = DEFAULT_MAX_HR): number {
  if (!avgHR || avgHR <= 100) return DANIELS_CONTINUOUS
  const expectedThresholdHR = maxHr * 0.88
  const hrDelta = expectedThresholdHR - avgHR
  return Math.max(0.89, Math.min(0.95, DANIELS_CONTINUOUS - hrDelta * 0.003))
}
// ─── Threshold session analysis (redesigned) ─────────────────────────────────

function buildThresholdEstimate(
  repEfforts: RepEffort[],
  recoveryLaps: RecoveryLap[],
  activity: { id: number; name: string; start_date: string; average_heartrate?: number },
  maxHr: number = DEFAULT_MAX_HR
): FiveKEstimate | null {
  if (repEfforts.length === 0) return null

  const totalWorkSecs = repEfforts.reduce((s, e) => s + e.durationSecs, 0)
  const totalRestSecs = recoveryLaps.reduce((s, r) => s + r.durationSecs, 0)
  const numReps = repEfforts.length
  const workRestRatio = totalRestSecs > 0 ? totalWorkSecs / totalRestSecs : 99

  // Structured threshold: Daniels structured ratio + rest-only correction (no double-dip)
  const restCorr = restOnlyCorrection(workRestRatio)

  let totalWeight = 0
  let weightedPaceSum = 0
  let weightedRawPaceSum = 0  // for direct 10K/HM estimates

  for (const rep of repEfforts) {
    const fiveKPace = rep.paceSecPerKm * DANIELS_STRUCTURED * restCorr
    rep.correctedPaceSec = fiveKPace
    rep.correctedSecs = fiveKPace * 5
    rep.correctionFactor = parseFloat((DANIELS_STRUCTURED * restCorr).toFixed(3))
    weightedPaceSum += fiveKPace * rep.weight
    weightedRawPaceSum += rep.paceSecPerKm * rep.weight
    totalWeight += rep.weight
  }

  const estimatedPaceSec = weightedPaceSum / totalWeight
  const rawThresholdPace = weightedRawPaceSum / totalWeight
  const estimatedSecs = Math.max(840, Math.min(3000, estimatedPaceSec * 5))
  const avgCorrection = repEfforts.reduce((s, e) => s + e.correctionFactor, 0) / repEfforts.length
  const date = runDay(activity)

  // Rep-to-rep drift (applies penalty to HM/FM estimates)
  const repDrift = computeRepDrift(repEfforts, totalWorkSecs + totalRestSecs)
  const hmDriftMult = repDrift.reliable ? driftPenaltyMultiplier(repDrift.excessDrift, 'hm') : 1
  const fmDriftMult = repDrift.reliable ? driftPenaltyMultiplier(repDrift.excessDrift, 'fm') : 1
  const driftNote = repDrift.reliable && repDrift.excessDrift > 0
    ? ` (rep drift +${repDrift.excessDrift.toFixed(1)}% excess)`
    : ''

  // Direct estimates for longer distances from threshold pace
  const hmSecs = rawThresholdPace * THRESHOLD_TO_HM * 21.097
  const raceEstimates: RaceEstimate[] = [
    {
      distanceKey: '5k',
      estimatedSecs,
      confidence: THRESHOLD_CONFIDENCE['5k'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: 'Structured threshold × Daniels 0.92 + rest correction',
    },
    {
      distanceKey: '10k',
      estimatedSecs: rawThresholdPace * THRESHOLD_TO_10K * 10,
      confidence: THRESHOLD_CONFIDENCE['10k'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: 'Threshold pace × 0.96 (Daniels direct 10K)',
    },
    {
      distanceKey: 'hm',
      estimatedSecs: hmSecs * hmDriftMult,
      confidence: THRESHOLD_CONFIDENCE['hm'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: `Threshold ≈ HM race pace (Daniels)${driftNote}`,
    },
    {
      distanceKey: 'fm',
      estimatedSecs: riegelProject(hmSecs, 21.097, 42.195, 1.07) * fmDriftMult,
      confidence: THRESHOLD_CONFIDENCE['fm'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: `Riegel from HM threshold estimate${driftNote}`,
    },
  ]

  return {
    date,
    activityId: activity.id,
    activityName: activity.name,
    estimatedSecs,
    estimatedPace: formatPace(estimatedSecs / 5),
    estimatedTime: formatTime(estimatedSecs),
    vdot: calcVdot(estimatedSecs),
    workRestRatio: parseFloat(workRestRatio.toFixed(2)),
    correctionFactor: parseFloat(avgCorrection.toFixed(3)),
    totalWorkSecs,
    totalRestSecs,
    effortsUsed: repEfforts.length,
    allEfforts: repEfforts,
    recoveryLaps,
    repDrift: repDrift.reliable ? repDrift : undefined,
    raceEstimates,
  }
}
export function analyzeThresholdSession(activity: {
  id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  laps?: any[]
  splits?: any[]
}, maxHr?: number): FiveKEstimate | null {
  if (!activity.average_speed || !activity.distance || !activity.moving_time) return null

  const laps: any[] = activity.laps ?? activity.splits ?? []
  const avgPace = activity.average_speed ? 1000 / activity.average_speed : 999
  const effectiveMaxHr = maxHr ?? DEFAULT_MAX_HR

  // Try structured first (has recovery laps)
  if (laps.length >= 3) {
    const { repEfforts, recoveryLaps } = processLaps(laps, avgPace, 180, 390)
    if (repEfforts.length >= 1 && recoveryLaps.length >= 1) {
      return buildThresholdEstimate(repEfforts, recoveryLaps, activity, effectiveMaxHr)
    }
  }

  // Continuous threshold run — strip warmup/cooldown and treat as one effort
  const splits: any[] = activity.splits ?? laps
  let distM = activity.distance
  let durSecs = activity.moving_time

  if (splits.length >= 4) {
    let startIdx = 0
    let endIdx = splits.length - 1
    while (startIdx < endIdx) {
      const p = splits[startIdx].average_speed ? 1000 / splits[startIdx].average_speed : 999
      if (p > avgPace + 20) startIdx++; else break
    }
    while (endIdx > startIdx) {
      const p = splits[endIdx].average_speed ? 1000 / splits[endIdx].average_speed : 999
      if (p > avgPace + 20) endIdx--; else break
    }
    if (startIdx > 0 || endIdx < splits.length - 1) {
      const effort = splits.slice(startIdx, endIdx + 1)
      distM = effort.reduce((s: number, sp: any) => s + (sp.distance ?? 0), 0)
      durSecs = effort.reduce((s: number, sp: any) => s + (sp.moving_time ?? 0), 0)
    }
  }

  if (durSecs < 600) return null
  const paceSec = distM > 0 ? (durSecs / distM) * 1000 : 999
  if (paceSec < 180 || paceSec > 420) return null

  // Continuous threshold: use DANIELS_CONTINUOUS with HR adjustment
  const ratio = continuousDanielsRatio(activity.average_heartrate, effectiveMaxHr)
  const fiveKPaceSec = paceSec * ratio
  const estimatedSecs = Math.max(840, Math.min(3000, fiveKPaceSec * 5))
  const date = runDay(activity)

  // Direct estimates for longer distances
  const raceEstimates: RaceEstimate[] = [
    {
      distanceKey: '5k',
      estimatedSecs,
      confidence: THRESHOLD_CONFIDENCE['5k'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: `Continuous threshold × Daniels ${ratio.toFixed(3)}`,
    },
    {
      distanceKey: '10k',
      estimatedSecs: paceSec * THRESHOLD_TO_10K * 10,
      confidence: THRESHOLD_CONFIDENCE['10k'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: 'Threshold pace × 0.96 (Daniels direct 10K)',
    },
    {
      distanceKey: 'hm',
      estimatedSecs: paceSec * THRESHOLD_TO_HM * 21.097,
      confidence: THRESHOLD_CONFIDENCE['hm'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: 'Threshold ≈ HM race pace (Daniels)',
    },
    {
      distanceKey: 'fm',
      estimatedSecs: riegelProject(paceSec * THRESHOLD_TO_HM * 21.097, 21.097, 42.195, 1.07),
      confidence: THRESHOLD_CONFIDENCE['fm'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: 'Riegel from HM threshold estimate',
    },
  ]

  return {
    date,
    activityId: activity.id,
    activityName: activity.name,
    estimatedSecs,
    estimatedPace: formatPace(estimatedSecs / 5),
    estimatedTime: formatTime(estimatedSecs),
    vdot: calcVdot(estimatedSecs),
    workRestRatio: 5.0,
    correctionFactor: parseFloat(ratio.toFixed(3)),
    totalWorkSecs: durSecs,
    totalRestSecs: 0,
    effortsUsed: 1,
    allEfforts: [],
    recoveryLaps: [],
    isContinuous: true,
    continuousDistM: distM,
    continuousDurSecs: durSecs,
    avgPaceSecPerKm: paceSec,
    raceEstimates,
  }
}
