import { type DistanceKey, type FiveKEstimate, type RaceEstimate, type RecoveryLap, type RepEffort } from './types'
import { calcVdot, formatPace, formatTime } from './formatting'
import { DISTANCE_KM, riegelProject } from './riegel'
import { DEFAULT_MAX_HR, driftPenaltyMultiplier } from './physiology'
import { computeRepDrift, intervalPositionMultiplier, newRepCorrection, processLaps } from './laps'
import { runDay } from '@/lib/calendar'
const INTERVAL_CONFIDENCE: Record<DistanceKey, number> = { '5k': 0.85, '10k': 0.70, 'hm': 0.50, 'fm': 0.30 }
// ─── Interval session analysis (redesigned) ──────────────────────────────────

function buildEstimate(
  repEfforts: RepEffort[],
  recoveryLaps: RecoveryLap[],
  activity: { id: number; name: string; start_date: string },
  maxHr: number = DEFAULT_MAX_HR
): FiveKEstimate | null {
  if (repEfforts.length === 0) return null

  const totalWorkSecs = repEfforts.reduce((s, e) => s + e.durationSecs, 0)
  const totalRestSecs = recoveryLaps.reduce((s, r) => s + r.durationSecs, 0)
  const numReps = repEfforts.length
  const workRestRatio = totalRestSecs > 0 ? totalWorkSecs / totalRestSecs : 99

  let totalWeight = 0
  let weightedPaceSum = 0

  for (let i = 0; i < numReps; i++) {
    const rep = repEfforts[i]
    const correction = newRepCorrection(workRestRatio, rep.durationSecs, rep.avgHR, maxHr)
    const correctedPace = rep.paceSecPerKm * correction
    const corrected5K = correctedPace * 5
    rep.correctedPaceSec = correctedPace
    rep.correctedSecs = corrected5K
    rep.correctionFactor = correction
    // Later reps matter more, but taper the spread for very large sessions.
    const positionMultiplier = intervalPositionMultiplier(i, numReps)
    const w = rep.weight * positionMultiplier
    weightedPaceSum += correctedPace * w
    totalWeight += w
  }

  const estimatedPaceSec = weightedPaceSum / totalWeight
  const estimatedSecs = Math.max(840, Math.min(3000, estimatedPaceSec * 5))
  const avgCorrection = repEfforts.reduce((s, e) => s + e.correctionFactor, 0) / repEfforts.length
  const date = runDay(activity)

  // Rep-to-rep drift (applies penalty to HM/FM estimates)
  const repDrift = computeRepDrift(repEfforts, totalWorkSecs + totalRestSecs)

  // Build multi-distance estimates from this 5K estimate
  const raceEstimates: RaceEstimate[] = []
  for (const dk of ['5k', '10k', 'hm', 'fm'] as DistanceKey[]) {
    const targetKm = DISTANCE_KM[dk]
    const baseSecs = dk === '5k' ? estimatedSecs : riegelProject(estimatedSecs, 5, targetKm)
    const driftMult = repDrift.reliable ? driftPenaltyMultiplier(repDrift.excessDrift, dk) : 1
    const projectedSecs = baseSecs * driftMult
    const driftNote = repDrift.reliable && driftMult > 1
      ? ` (rep drift +${repDrift.excessDrift.toFixed(1)}% excess)`
      : ''
    raceEstimates.push({
      distanceKey: dk,
      estimatedSecs: projectedSecs,
      confidence: INTERVAL_CONFIDENCE[dk],
      source: 'interval',
      date,
      activityId: activity.id,
      method: dk === '5k' ? 'Rep pace + rest/duration/HR correction' : `Riegel from 5K interval estimate${driftNote}`,
    })
  }

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
export function analyzeIntervalSession(activity: {
  id: number
  name: string
  start_date: string
  average_speed: number
  laps?: any[]
  splits?: any[]
}, maxHr?: number): FiveKEstimate | null {
  const laps: any[] = activity.laps ?? activity.splits ?? []
  if (laps.length < 2) return null
  const avgPace = activity.average_speed ? 1000 / activity.average_speed : 999
  const { repEfforts, recoveryLaps } = processLaps(laps, avgPace, undefined, undefined, { fastClusterOnly: true })
  return buildEstimate(repEfforts, recoveryLaps, activity, maxHr ?? DEFAULT_MAX_HR)
}
export function analyzeAllIntervalSessions(activities: any[], maxHr?: number): FiveKEstimate[] {
  return activities.map(a => analyzeIntervalSession(a, maxHr)).filter(Boolean) as FiveKEstimate[]
}
