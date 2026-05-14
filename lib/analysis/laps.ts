import { type RepDriftResult, type RecoveryLap, type RepEffort } from './types'
import { DEFAULT_MAX_HR, RACE_5K_HR_FRACTION, expectedCardiacDrift } from './physiology'
const MIN_EFFORT_DISTANCE = 180
const MIN_EFFORT_DURATION = 45
const MAX_EFFORT_PACE = 390
const MIN_EFFORT_PACE = 160
const RECOVERY_THRESHOLD = 40
// 5K is run at ~96% HRmax

/**
 * New single-formula correction for interval reps.
 * Eliminates the old 0.93 calibration hack.
 *
 * correction = 1 + restAdjust + durationAdjust + hrAdjust
 *
 * Calibrated so typical sessions (WR=2, 180s reps) get ~+4% correction.
 * Duration and HR carry more weight to differentiate short vs long reps
 * and high vs low effort. Very short reps get a steeper penalty than a
 * simple linear duration term because they overstate sustainable 5K pace.
 *
 * Clamped to [1.0, 1.15]
 */
export function newRepCorrection(workRestRatio: number, repDurationSecs: number, repHR?: number, maxHr: number = DEFAULT_MAX_HR): number {
  // Rest adjustment: more rest = artificially faster
  // WR=1→+5%, WR=2→+3.3%, WR=3→+2.5%, WR=5→+1.7%
  const restAdjust = 0.10 / (1 + workRestRatio)

  // Duration adjustment: short reps tap anaerobic systems.
  // Use a convex curve so 45-90s reps are penalized more than mid-length reps.
  const shortRepFactor = Math.max(0, 1 - repDurationSecs / 360)
  const durationAdjust = 0.10 * shortRepFactor + 0.08 * shortRepFactor * shortRepFactor

  // HR adjustment: ~2.7% per 10bpm at race intensity, clamped ±5%
  // Positive when repHR > raceHR (unsustainable effort → add correction)
  // Negative when repHR < raceHR (has more in the tank → subtract correction)
  let hrAdjust = 0
  if (repHR && repHR > 100) {
    const targetHR = maxHr * RACE_5K_HR_FRACTION
    hrAdjust = ((repHR - targetHR) / targetHR) * 0.5
    hrAdjust = Math.max(-0.05, Math.min(0.05, hrAdjust))
  }

  return Math.max(1.0, Math.min(1.15, 1 + restAdjust + durationAdjust + hrAdjust))
}
export function intervalPositionMultiplier(repIndex: number, numReps: number): number {
  if (numReps <= 1) return 1

  // Small sessions can lean hard on the finish, but long sessions should not let
  // the final few reps overwhelm the first 80-90% of the workout.
  const progress = repIndex / (numReps - 1)
  const maxExtra = Math.max(0.6, Math.min(2, 2 * Math.sqrt(3 / numReps)))
  const easedProgress = Math.pow(progress, 0.7)
  return 1 + maxExtra * easedProgress
}
// Rest-only correction for structured threshold (avoids double-dip with Daniels)
export function restOnlyCorrection(workRestRatio: number): number {
  return 1 + 0.04 / (1 + workRestRatio)
}
// ─── Lap classification ──────────────────────────────────────────────────────
export function processLaps(
  laps: any[],
  avgPaceSecPerKm: number,
  minPace: number = MIN_EFFORT_PACE,
  maxPace: number = MAX_EFFORT_PACE
): { repEfforts: RepEffort[]; recoveryLaps: RecoveryLap[] } {
  const repEfforts: RepEffort[] = []
  const allSlowLaps: { idx: number; lap: any }[] = []

  for (let i = 0; i < laps.length; i++) {
    const lap = laps[i]
    if (!lap.average_speed || !lap.distance || !lap.moving_time) continue

    const distM = lap.distance
    const durSecs = lap.moving_time
    const paceSecPerKm = 1000 / lap.average_speed

    if (paceSecPerKm > avgPaceSecPerKm + RECOVERY_THRESHOLD) {
      allSlowLaps.push({ idx: i, lap })
      continue
    }

    if (
      distM >= MIN_EFFORT_DISTANCE &&
      durSecs >= MIN_EFFORT_DURATION &&
      paceSecPerKm >= minPace &&
      paceSecPerKm <= maxPace &&
      paceSecPerKm <= avgPaceSecPerKm - 5
    ) {
      repEfforts.push({
        lapIndex: i + 1,
        distanceM: distM,
        durationSecs: durSecs,
        paceSecPerKm,
        avgHR: lap.average_heartrate ?? undefined,
        correctedPaceSec: 0,
        correctedSecs: 0,
        correctionFactor: 0,
        weight: Math.pow(durSecs, 1.5),  // duration^1.5 (was ^2, less extreme now)
      })
    }
  }

  if (repEfforts.length === 0) return { repEfforts, recoveryLaps: [] }

  const firstRepIdx = repEfforts[0].lapIndex - 1
  const lastRepIdx = repEfforts[repEfforts.length - 1].lapIndex - 1

  const recoveryLaps: RecoveryLap[] = allSlowLaps
    .filter(({ idx }) => idx > firstRepIdx && idx < lastRepIdx)
    .map(({ idx, lap }) => ({
      lapIndex: idx + 1,
      distanceM: lap.distance,
      durationSecs: lap.moving_time,
      paceSecPerKm: 1000 / lap.average_speed,
    }))

  return { repEfforts, recoveryLaps }
}
/**
 * Computes rep-to-rep HR drift across a structured session.
 * Compares first vs last rep (or first/last third for sessions with ≥6 reps).
 * Pace-adjusts using the same 2.5 sec/km-per-bpm slope used elsewhere.
 * Requires ≥3 reps with HR data to return reliable=true.
 */
export function computeRepDrift(reps: RepEffort[], sessionDurationSecs: number): RepDriftResult {
  const repsWithHR = reps.filter(r => r.avgHR && r.avgHR > 100)
  if (repsWithHR.length < 3) {
    return { drift: 0, excessDrift: 0, reliable: false, firstRepHR: 0, lastRepHR: 0, paceAdjusted: false }
  }

  const n      = repsWithHR.length
  const nGroup = n >= 6 ? Math.floor(n / 3) : 1
  const first  = repsWithHR.slice(0, nGroup)
  const last   = repsWithHR.slice(-nGroup)

  const avg = (arr: RepEffort[], fn: (r: RepEffort) => number) =>
    arr.reduce((s, r) => s + fn(r), 0) / arr.length

  const firstHR   = avg(first, r => r.avgHR!)
  const lastHR    = avg(last,  r => r.avgHR!)
  const firstPace = avg(first, r => r.paceSecPerKm)
  const lastPace  = avg(last,  r => r.paceSecPerKm)

  // Pace-adjust: if last reps were paced differently, normalize HR back to first-rep pace
  const paceDiff     = lastPace - firstPace          // positive = slowed down
  const paceAdjusted = Math.abs(paceDiff) > firstPace * 0.04
  const adjLastHR    = lastHR + paceDiff / 2.5
  const effectiveHR  = paceAdjusted ? adjLastHR : lastHR

  const drift       = firstHR > 0 ? ((effectiveHR - firstHR) / firstHR) * 100 : 0
  const expected    = expectedCardiacDrift(sessionDurationSecs / 60)
  const excessDrift = drift - expected

  return { drift, excessDrift, reliable: true, firstRepHR: firstHR, lastRepHR: lastHR, paceAdjusted }
}
