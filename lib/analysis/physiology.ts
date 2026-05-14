import { type DistanceKey, type DriftWindow } from './types'
import { type TimedSplit, wavg } from './steadyWindows'
export const DEFAULT_MAX_HR = 195
export const RACE_5K_HR_FRACTION = 0.96
export const REF_HR = 150
export const AEROBIC_SLOPE = -2.5
const ENDURANCE_REF_MINS = 45
const ENDURANCE_DURATION_K = 10
const DRIFT_EXPECTED_BASE = 2.5
const DRIFT_EXPECTED_REF_MINS = 15
const DRIFT_RACE_SCALE: Record<DistanceKey, number> = { '5k': 0.0, '10k': 0.3, 'hm': 0.7, 'fm': 1.0 }
const DRIFT_PENALTY_SCALE = 1.5
const DRIFT_PENALTY_MAX_PCT = 8
export // cap at 8%

/** Expected % cardiac drift for a run of given duration (physiological log model). */
function expectedCardiacDrift(durationMins: number): number {
  return DRIFT_EXPECTED_BASE *
    Math.log(Math.max(durationMins, DRIFT_EXPECTED_REF_MINS) / DRIFT_EXPECTED_REF_MINS)
}
export /**
 * Returns a pace-time multiplier (≥1.0) from excess drift, scaled by race distance.
 * Apply by multiplying into estimatedSecs.
 * Examples at 3% excess drift: 5K→×1.000, 10K→×1.009, HM→×1.021, FM→×1.030
 */
function driftPenaltyMultiplier(excessDrift: number, distanceKey: DistanceKey): number {
  const scale = DRIFT_RACE_SCALE[distanceKey]
  const penaltyPct = Math.min(DRIFT_PENALTY_MAX_PCT,
    Math.max(0, excessDrift) * scale * DRIFT_PENALTY_SCALE)
  return 1 + penaltyPct / 100
}
export function durationEfficiencyCredit(durationMins: number): number {
  return ENDURANCE_DURATION_K * Math.log2(Math.max(durationMins, 5) / ENDURANCE_REF_MINS)
}
export // Compare HR between an early window (~30% into the supplied segment) and the
// last N min. Accepts a pre-built TimedSplit array so callers can pass only
// the steady portion of a run (stripping any fast block beforehand).
// opts allows shorter windows for tempo/easy runs (defaults preserve original long-run behaviour).
function computeCardiacDrift(
  timed: TimedSplit[],
  totalSecs: number,
  opts?: { minDurationSecs?: number; windowSecs?: number; minGapSecs?: number }
): {
  drift: number
  excessDrift: number      // drift minus expectedCardiacDrift(totalSecs/60)
  reliable: boolean
  paceAdjusted: boolean
  reason?: string
  earlyWindow?: DriftWindow
  lateWindow?: DriftWindow
} {
  const MIN_RUN_SECS    = opts?.minDurationSecs ?? 55 * 60
  const WINDOW_SECS     = opts?.windowSecs      ?? 15 * 60
  const MIN_GAP_SECS    = opts?.minGapSecs       ?? 20 * 60
  // sec/km per bpm — same slope used in HR projection elsewhere in this file
  const HR_PACE_SLOPE   = 2.5

  const noData = (reason: string) => ({
    drift: 0, excessDrift: -expectedCardiacDrift(totalSecs / 60),
    reliable: false, paceAdjusted: false, reason,
  })

  if (timed.length < 4)         return noData('no split data')
  if (totalSecs < MIN_RUN_SECS) return noData(`segment too short for drift (<${Math.round(MIN_RUN_SECS/60)} min)`)

  const earlyStart = totalSecs * 0.30
  const earlyEnd   = earlyStart + WINDOW_SECS
  const lateStart  = totalSecs - WINDOW_SECS
  const lateEnd    = totalSecs

  if (lateStart - earlyEnd < MIN_GAP_SECS) {
    return noData(`windows too close (<${Math.round(MIN_GAP_SECS/60)} min apart)`)
  }

  // Overlap-based filter: include any split that intersects the window, not just
  // splits fully contained within it. Per-km splits can be 5-8 min wide, so a
  // "fully contained" filter often lets only 1 split through per window.
  const earlySplits = timed.filter(s => s.tStart < earlyEnd && s.tEnd > earlyStart)
  const lateSplits  = timed.filter(s => s.tStart < lateEnd   && s.tEnd > lateStart)

  if (earlySplits.length < 2 || lateSplits.length < 2) {
    return noData('insufficient splits in comparison windows')
  }

  const earlyHR   = wavg(earlySplits, 'hr')
  const lateHR    = wavg(lateSplits,  'hr')
  const earlyPace = wavg(earlySplits, 'pace')
  const latePace  = wavg(lateSplits,  'pace')

  // Pace-adjusted drift: if pace changed, the runner slowed down (or sped up)
  // to keep HR manageable. We normalise the late HR back to what it would have
  // been at the early pace using the empirical 2.5 sec/km-per-bpm slope:
  //   adjustedLateHR = lateHR + (latePace - earlyPace) / HR_PACE_SLOPE
  // e.g. pace dropped 30 sec/km → HR was "suppressed" by 12 bpm → add those
  // back before comparing.
  const paceDiff         = latePace - earlyPace  // positive = got slower
  const paceAdjusted     = Math.abs(paceDiff) > earlyPace * 0.05  // adjust when >5% pace change
  const adjustedLateHR   = lateHR + paceDiff / HR_PACE_SLOPE
  const effectiveLateHR  = paceAdjusted ? adjustedLateHR : lateHR

  const drift = earlyHR > 0 ? ((effectiveLateHR - earlyHR) / earlyHR) * 100 : 0
  const excessDrift = drift - expectedCardiacDrift(totalSecs / 60)

  const earlyWindowData: DriftWindow = {
    avgPace: earlyPace, avgHR: earlyHR,
    startSec: earlySplits[0].tStart, endSec: earlySplits[earlySplits.length - 1].tEnd,
  }
  const lateWindowData: DriftWindow = {
    avgPace: latePace, avgHR: lateHR,
    adjustedHR: paceAdjusted ? parseFloat(adjustedLateHR.toFixed(1)) : undefined,
    startSec: lateSplits[0].tStart, endSec: lateSplits[lateSplits.length - 1].tEnd,
  }

  const reason = paceAdjusted
    ? `pace-adjusted (${paceDiff > 0 ? '+' : ''}${paceDiff.toFixed(0)}s/km → late HR adj. ${adjustedLateHR > lateHR ? '+' : ''}${(adjustedLateHR - lateHR).toFixed(0)} bpm)`
    : undefined

  return { drift, excessDrift, reliable: true, paceAdjusted, reason, earlyWindow: earlyWindowData, lateWindow: lateWindowData }
}
