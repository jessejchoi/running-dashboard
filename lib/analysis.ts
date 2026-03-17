/**
 * Multi-distance race time estimation engine.
 *
 * Produces direct estimates per distance from multiple training signals:
 * - Intervals → primarily 5K, with Riegel to longer distances
 * - Threshold → direct 5K, 10K, HM estimates via Daniels ratios
 * - Long runs → HM/FM from steady-state pace + cardiac drift
 * - Race results → gold standard, project to other distances via Riegel
 * - Easy run trend → low-confidence estimates from normalised pace trend
 *
 * Combines estimates with confidence and recency weighting.
 */

import { type DistanceKey } from '@/lib/goals'
export type { DistanceKey }

// ─── Formatting ───────────────────────────────────────────────────────────────

function calcVdot(secs: number): number {
  const tMin = secs / 60
  const speed = 5000 / tMin
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)
  const vo2 = -4.6 + 0.182258 * speed + 0.000104 * speed * speed
  return Math.round(vo2 / pct * 10) / 10
}

export function formatTime(secs: number): string {
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    let s = Math.round(secs % 60)
    if (s === 60) { return `${h}:${(m + 1).toString().padStart(2, '0')}:00` }
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  let m = Math.floor(secs / 60)
  let s = Math.round(secs % 60)
  if (s === 60) { m += 1; s = 0 }
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function formatPace(secsPerKm: number): string {
  let m = Math.floor(secsPerKm / 60)
  let s = Math.round(secsPerKm % 60)
  if (s === 60) { m += 1; s = 0 }
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── New types ───────────────────────────────────────────────────────────────

export type EstimateSource = 'interval' | 'threshold' | 'long_run' | 'easy_trend' | 'race_result'

export interface RaceEstimate {
  distanceKey: DistanceKey
  estimatedSecs: number
  confidence: number          // 0-1
  source: EstimateSource
  date: string
  activityId: number
  method: string              // human-readable derivation note
}

export interface ActivityAnalysis {
  activityId: number
  activityName: string
  date: string
  source: EstimateSource
  estimates: RaceEstimate[]
  // existing detail fields preserved for UI
  repEfforts?: RepEffort[]
  recoveryLaps?: RecoveryLap[]
  isContinuous?: boolean
  avgPaceSecPerKm?: number
  // FiveKEstimate compat fields
  workRestRatio?: number
  correctionFactor?: number
  totalWorkSecs?: number
  totalRestSecs?: number
  effortsUsed?: number
  continuousDistM?: number
  continuousDurSecs?: number
  // Long run fields
  cardiacDrift?: number
  steadyPace?: number
  steadyHR?: number
  windowSecs?: number
  // Race result fields
  raceDistanceKey?: DistanceKey
  raceTimeSecs?: number
  // Easy trend fields (from per-run)
  normalizedPaceSec?: number
}

export interface CombinedEstimate {
  bestEstimateSecs: number
  confidence: number
  contributors: {
    source: EstimateSource
    estimatedSecs: number
    weight: number
    date: string
    activityId: number
    method: string
  }[]
}

// ─── Riegel projection ───────────────────────────────────────────────────────

const DISTANCE_KM: Record<DistanceKey, number> = {
  '5k': 5,
  '10k': 10,
  'hm': 21.097,
  'fm': 42.195,
}

/**
 * Riegel formula with variable fatigue exponent.
 * Default exponents by distance gap:
 *   short→short: 1.06, short→HM: 1.07, short→FM: 1.08
 */
export function riegelProject(baseSecs: number, baseKm: number, targetKm: number, exponent?: number): number {
  const exp = exponent ?? (targetKm > 30 ? 1.08 : targetKm > 15 ? 1.07 : 1.06)
  return baseSecs * Math.pow(targetKm / baseKm, exp)
}

// ─── Rest correction (redesigned) ────────────────────────────────────────────

const DEFAULT_MAX_HR = 195
const RACE_5K_HR_FRACTION = 0.96  // 5K is run at ~96% HRmax

/**
 * New single-formula correction for interval reps.
 * Eliminates the old 0.93 calibration hack.
 *
 * correction = 1 + restAdjust + durationAdjust + hrAdjust
 * Clamped to [1.0, 1.15]
 */
function newRepCorrection(workRestRatio: number, repDurationSecs: number, repHR?: number, maxHr: number = DEFAULT_MAX_HR): number {
  // Rest adjustment: more rest = artificially faster
  const restAdjust = 0.10 / (1 + workRestRatio)

  // Duration adjustment: short reps tap anaerobic systems
  const durationAdjust = 0.06 * Math.max(0, 1 - repDurationSecs / 300)

  // HR adjustment: fine-tunes for actual exertion
  let hrAdjust = 0
  if (repHR && repHR > 100) {
    const targetHR = maxHr * RACE_5K_HR_FRACTION
    hrAdjust = ((targetHR - repHR) / targetHR) * 0.08
    hrAdjust = Math.max(-0.04, Math.min(0.04, hrAdjust))
  }

  return Math.max(1.0, Math.min(1.15, 1 + restAdjust + durationAdjust + hrAdjust))
}

// Keep old repCorrectionFactor for threshold structured (rest-only portion)
function restOnlyCorrection(workRestRatio: number): number {
  return 1 + 0.10 / (1 + workRestRatio)
}

// ─── Legacy types (kept for backward compat with UI) ─────────────────────────

export interface RepEffort {
  lapIndex: number
  distanceM: number
  durationSecs: number
  paceSecPerKm: number
  avgHR?: number
  correctedPaceSec: number
  correctedSecs: number
  correctionFactor: number
  weight: number
}

export interface RecoveryLap {
  lapIndex: number
  distanceM: number
  durationSecs: number
  paceSecPerKm: number
}

export interface FiveKEstimate {
  date: string
  activityId: number
  activityName: string
  estimatedSecs: number
  estimatedPace: string
  estimatedTime: string
  vdot: number
  workRestRatio: number
  correctionFactor: number
  totalWorkSecs: number
  totalRestSecs: number
  effortsUsed: number
  allEfforts: RepEffort[]
  recoveryLaps: RecoveryLap[]
  isContinuous?: boolean
  continuousDistM?: number
  continuousDurSecs?: number
  avgPaceSecPerKm?: number
  // New: multi-distance estimates attached
  raceEstimates?: RaceEstimate[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_EFFORT_DISTANCE = 310
const MIN_EFFORT_DURATION = 60
const MAX_EFFORT_PACE = 390    // 6:30/km — slower = recovery
const MIN_EFFORT_PACE = 160    // 2:40/km — faster = pure sprint
const RECOVERY_THRESHOLD = 40  // sec/km slower than session avg = recovery lap

// Confidence per source × distance
const INTERVAL_CONFIDENCE: Record<DistanceKey, number> = { '5k': 0.85, '10k': 0.70, 'hm': 0.50, 'fm': 0.30 }
const THRESHOLD_CONFIDENCE: Record<DistanceKey, number> = { '5k': 0.70, '10k': 0.80, 'hm': 0.75, 'fm': 0.45 }

// ─── Lap classification ──────────────────────────────────────────────────────

function processLaps(
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

// ─── Threshold ratios ────────────────────────────────────────────────────────

const DANIELS_CONTINUOUS = 0.907  // continuous threshold → 5K pace ratio
const DANIELS_STRUCTURED = 0.92   // structured threshold → 5K (accounts for rest)
const THRESHOLD_TO_10K = 0.96     // threshold pace × 0.96 = 10K pace
const THRESHOLD_TO_HM = 1.0       // threshold ≈ HM race pace

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
    // Position weighting: first rep = 1x, last rep = 3x (fixed from old 2x bug)
    const positionMultiplier = numReps > 1 ? 1 + 2 * (i / (numReps - 1)) : 1
    const w = rep.weight * positionMultiplier
    weightedPaceSum += correctedPace * w
    totalWeight += w
  }

  const estimatedPaceSec = weightedPaceSum / totalWeight
  const estimatedSecs = Math.max(840, Math.min(3000, estimatedPaceSec * 5))
  const avgCorrection = repEfforts.reduce((s, e) => s + e.correctionFactor, 0) / repEfforts.length
  const date = activity.start_date.split('T')[0]

  // Build multi-distance estimates from this 5K estimate
  const raceEstimates: RaceEstimate[] = []
  for (const dk of ['5k', '10k', 'hm', 'fm'] as DistanceKey[]) {
    const targetKm = DISTANCE_KM[dk]
    const projectedSecs = dk === '5k' ? estimatedSecs : riegelProject(estimatedSecs, 5, targetKm)
    raceEstimates.push({
      distanceKey: dk,
      estimatedSecs: projectedSecs,
      confidence: INTERVAL_CONFIDENCE[dk],
      source: 'interval',
      date,
      activityId: activity.id,
      method: dk === '5k' ? 'Rep pace + rest/duration/HR correction' : `Riegel from 5K interval estimate`,
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
    raceEstimates,
  }
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
  const date = activity.start_date.split('T')[0]

  // Direct estimates for longer distances from threshold pace
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
      estimatedSecs: rawThresholdPace * THRESHOLD_TO_HM * 21.097,
      confidence: THRESHOLD_CONFIDENCE['hm'],
      source: 'threshold',
      date,
      activityId: activity.id,
      method: 'Threshold ≈ HM race pace (Daniels)',
    },
    {
      distanceKey: 'fm',
      estimatedSecs: riegelProject(rawThresholdPace * THRESHOLD_TO_HM * 21.097, 21.097, 42.195, 1.07),
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
    workRestRatio: parseFloat(workRestRatio.toFixed(2)),
    correctionFactor: parseFloat(avgCorrection.toFixed(3)),
    totalWorkSecs,
    totalRestSecs,
    effortsUsed: repEfforts.length,
    allEfforts: repEfforts,
    recoveryLaps,
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
  const { repEfforts, recoveryLaps } = processLaps(laps, avgPace)
  return buildEstimate(repEfforts, recoveryLaps, activity, maxHr ?? DEFAULT_MAX_HR)
}

export function analyzeAllIntervalSessions(activities: any[], maxHr?: number): FiveKEstimate[] {
  return activities.map(a => analyzeIntervalSession(a, maxHr)).filter(Boolean) as FiveKEstimate[]
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
  const date = activity.start_date.split('T')[0]

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

// ─── Shared steady-window extraction ─────────────────────────────────────────

interface SteadyWindow {
  avgPace: number
  avgHR: number
  splits: { paceSecPerKm: number; hr: number; duration: number }[]
  windowSecs: number
}

function extractSteadyWindow(activity: {
  laps?: any[]
  splits?: any[]
  average_heartrate?: number
  average_speed?: number
}): SteadyWindow | null {
  const TARGET_WINDOW = 15 * 60
  const laps: any[] = activity.laps ?? []

  // Find target lap (last lap >= 15 min)
  let targetLap: any = null
  for (let i = laps.length - 1; i >= 0; i--) {
    const lapTime = laps[i].moving_time ?? laps[i].elapsed_time ?? 0
    if (lapTime >= TARGET_WINDOW) {
      targetLap = laps[i]
      break
    }
  }

  if (!targetLap) return null

  // Compute target lap's start time
  let lapStartSec = 0
  for (const lap of laps) {
    if (lap === targetLap) break
    lapStartSec += lap.elapsed_time ?? lap.moving_time ?? 0
  }
  const lapDurSec = targetLap.moving_time ?? targetLap.elapsed_time ?? 0
  const lapEndSec = lapStartSec + lapDurSec

  // Map km splits to cumulative time, filter to target lap
  const kmSplits: any[] = activity.splits ?? []
  let cumSec = 0
  const timedKmSplits = kmSplits.map((sp: any) => {
    const dur = sp.elapsed_time ?? sp.moving_time ?? 60
    const item = { sp, tStart: cumSec, tEnd: cumSec + dur }
    cumSec += dur
    return item
  })

  const lapKmSplits = timedKmSplits
    .filter(ts => ts.tStart >= lapStartSec - 30 && ts.tEnd <= lapEndSec + 30)
    .filter(ts => ts.sp.average_heartrate && ts.sp.average_speed)
    .map(ts => ({
      paceSecPerKm: 1000 / ts.sp.average_speed,
      hr: ts.sp.average_heartrate,
      duration: ts.sp.elapsed_time ?? ts.sp.moving_time ?? 60,
    }))

  if (lapKmSplits.length >= 1) {
    // Take last 15 min
    const windowSplits: typeof lapKmSplits = []
    let wSecs = 0
    for (let i = lapKmSplits.length - 1; i >= 0 && wSecs < TARGET_WINDOW; i--) {
      windowSplits.unshift(lapKmSplits[i])
      wSecs += lapKmSplits[i].duration
    }
    const useSplits = windowSplits.length >= 1 ? windowSplits : lapKmSplits
    const totalDur = useSplits.reduce((s, sp) => s + sp.duration, 0)
    if (totalDur > 0) {
      return {
        avgPace: useSplits.reduce((s, sp) => s + sp.paceSecPerKm * sp.duration, 0) / totalDur,
        avgHR: useSplits.reduce((s, sp) => s + sp.hr * sp.duration, 0) / totalDur,
        splits: useSplits,
        windowSecs: totalDur,
      }
    }
  }

  // Fallback to target lap averages
  if (targetLap.average_heartrate && targetLap.average_speed) {
    return {
      avgPace: 1000 / targetLap.average_speed,
      avgHR: targetLap.average_heartrate,
      splits: [],
      windowSecs: lapDurSec,
    }
  }

  return null
}

// ─── Easy run aerobic efficiency analysis ─────────────────────────────────────

const REF_HR = 150
const AEROBIC_SLOPE = -2.5  // sec/km per bpm — updated from -3.0 (closer to literature)

export interface EasyRunEfficiency {
  date: string
  activityId: number
  activityName: string
  excludedReason?: string
  runType: string
  normalizedPaceSec: number
  avgHR: number
  avgPaceSecPerKm: number
  slope: number
  r2: number
  splitsUsed: number
  splits: { km: number; paceSecPerKm: number; hr: number }[]
}

export function analyzeEasyRun(activity: {
  id: number
  name: string
  start_date: string
  run_type?: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  splits?: any[]
  laps?: any[]
  raw?: any
}): EasyRunEfficiency | null {
  const stub = (excludedReason: string): EasyRunEfficiency => ({
    date: new Date(new Date(activity.start_date).getTime() + 7*60*60*1000).toISOString().split('T')[0],
    activityId: activity.id,
    activityName: activity.name,
    runType: activity.run_type ?? 'easy',
    excludedReason,
    normalizedPaceSec: 0, avgHR: 0, avgPaceSecPerKm: 0,
    windowHR: 0, windowPace: 0, windowSecs: 0, windowSplitsCount: 0,
    slope: 0, r2: 0, splitsUsed: 0, splits: [],
    estimatedPace: '', estimatedTime: '',
  } as any)

  if (!activity.average_heartrate || !activity.average_speed) return stub('No HR or pace data recorded')
  if (activity.run_type === 'treadmill' || activity.raw?.trainer) return stub('Treadmill run — no GPS pace data')

  const wholeRunAvgHR   = activity.average_heartrate
  const wholeRunAvgPace = 1000 / activity.average_speed

  if (wholeRunAvgPace < 280) return stub('Pace too fast to be an easy run (< 4:40/km) — tag as interval or threshold instead')
  if (wholeRunAvgHR > 178) return stub('Avg HR above threshold zone — tag as threshold or interval instead')
  if (activity.moving_time < 900) return stub('Run too short (< 15 min)')

  // Use shared steady window extraction
  const window = extractSteadyWindow(activity)
  if (!window) return stub('No steady lap ≥ 15 min found — run may be all strides/short laps')

  let avgHR = window.avgHR
  let avgPace = window.avgPace
  const windowHR = window.avgHR
  const windowPace = window.avgPace
  const windowSecs = window.windowSecs
  const windowSplitsCount = window.splits.length

  // Use window splits for regression (consistent with the pace/HR used for estimate)
  const windowSplitsForRegression = window.splits.map((sp, i) => ({
    km: i + 1,
    paceSecPerKm: sp.paceSecPerKm,
    hr: sp.hr,
    duration: sp.duration,
  }))

  // Also build validSplits from all km splits for display
  const kmSplits: any[] = activity.splits ?? []
  const validSplits = kmSplits
    .filter((sp: any) => sp.average_heartrate && sp.average_speed)
    .map((sp: any, i: number) => ({
      km: i + 1,
      paceSecPerKm: 1000 / sp.average_speed,
      hr: sp.average_heartrate,
      duration: sp.elapsed_time ?? sp.moving_time ?? 60,
    }))

  // Regression on window splits (consistent with estimate)
  let slope = AEROBIC_SLOPE
  let r2 = 0
  const regressionSplits = windowSplitsForRegression.length >= 4 ? windowSplitsForRegression : validSplits

  if (regressionSplits.length >= 4) {
    const hrs = regressionSplits.map(s => s.hr)
    const hrRange = Math.max(...hrs) - Math.min(...hrs)

    if (hrRange >= 8) {
      const n = regressionSplits.length
      const xs = hrs
      const ys = regressionSplits.map(s => s.paceSecPerKm)
      const sumX  = xs.reduce((a, b) => a + b, 0)
      const sumY  = ys.reduce((a, b) => a + b, 0)
      const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0)
      const sumX2 = xs.reduce((s, x) => s + x * x, 0)
      const denom = n * sumX2 - sumX * sumX

      if (Math.abs(denom) > 1e-10) {
        const regSlope = (n * sumXY - sumX * sumY) / denom
        const regIntercept = (sumY - regSlope * sumX) / n
        const yMean = sumY / n
        const ssTot = ys.reduce((s, y) => s + (y - yMean) ** 2, 0)
        const ssRes = ys.reduce((s, y, i) => s + (y - (regIntercept + regSlope * xs[i])) ** 2, 0)
        const regR2 = ssTot > 0 ? 1 - ssRes / ssTot : 0

        if (regR2 >= 0.25 && regSlope < -0.5 && regSlope > -6) {
          slope = regSlope
          r2 = regR2
        }
      }
    }
  }

  const normalizedPaceSec = avgPace + slope * (REF_HR - avgHR)
  if (normalizedPaceSec < 200 || normalizedPaceSec > 540) return stub('Normalised pace out of range — check HR data')

  return {
    date: new Date(new Date(activity.start_date).getTime() + 7*60*60*1000).toISOString().split('T')[0],
    activityId: activity.id,
    activityName: activity.name,
    runType: activity.run_type ?? 'easy',
    normalizedPaceSec: parseFloat(normalizedPaceSec.toFixed(1)),
    avgHR,
    avgPaceSecPerKm: parseFloat(avgPace.toFixed(1)),
    windowHR: parseFloat(windowHR.toFixed(1)),
    windowPace: parseFloat(windowPace.toFixed(1)),
    windowSecs,
    windowSplitsCount,
    slope: parseFloat(slope.toFixed(3)),
    r2: parseFloat(r2.toFixed(3)),
    splitsUsed: validSplits.length,
    splits: validSplits,
  } as any
}

export function analyzeAllEasyRuns(activities: any[]): EasyRunEfficiency[] {
  return activities.map(a => analyzeEasyRun(a)).filter(Boolean) as EasyRunEfficiency[]
}

export function analyzeAllEasyRunsWithReasons(activities: any[]): EasyRunEfficiency[] {
  return activities.map(a => analyzeEasyRun(a)).filter(Boolean) as EasyRunEfficiency[]
}

// ─── Long run analyzer ───────────────────────────────────────────────────────

export interface LongRunAnalysis {
  date: string
  activityId: number
  activityName: string
  distanceKm: number
  steadyPace: number      // sec/km from steady window
  steadyHR: number
  cardiacDrift: number     // % HR increase 1st→2nd half of window
  windowSecs: number
  raceEstimates: RaceEstimate[]
}

export function analyzeLongRun(activity: {
  id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  average_heartrate?: number
  laps?: any[]
  splits?: any[]
}, maxHr: number = DEFAULT_MAX_HR): LongRunAnalysis | null {
  const distKm = activity.distance / 1000
  if (distKm < 15) return null
  if (!activity.average_heartrate) return null

  const window = extractSteadyWindow(activity)
  if (!window || window.windowSecs < 600) return null

  // Measure cardiac drift from window splits
  let cardiacDrift = 0
  if (window.splits.length >= 4) {
    const half = Math.floor(window.splits.length / 2)
    const firstHalf = window.splits.slice(0, half)
    const secondHalf = window.splits.slice(half)
    const firstHR = firstHalf.reduce((s, sp) => s + sp.hr * sp.duration, 0) / firstHalf.reduce((s, sp) => s + sp.duration, 0)
    const secondHR = secondHalf.reduce((s, sp) => s + sp.hr * sp.duration, 0) / secondHalf.reduce((s, sp) => s + sp.duration, 0)
    cardiacDrift = firstHR > 0 ? ((secondHR - firstHR) / firstHR) * 100 : 0
  }

  const date = activity.start_date.split('T')[0]

  // HM race HR ≈ 87% max HR, FM race HR ≈ 82% max HR
  const hmRaceHR = maxHr * 0.87
  const fmRaceHR = maxHr * 0.82
  const steadyHRPercent = window.avgHR / maxHr

  // Pace improvement ≈ 2.5 sec/km per %HRmax gained
  const hmHRDiff = (hmRaceHR - window.avgHR) / maxHr * 100  // % difference
  const fmHRDiff = (fmRaceHR - window.avgHR) / maxHr * 100

  const hmPace = window.avgPace - hmHRDiff * 2.5
  const fmPace = window.avgPace - fmHRDiff * 2.5

  // Distance factor: longer runs = more confidence
  const distanceFactor = Math.min(1, distKm / 25)

  // Drift factor: high drift = less FM confidence
  const driftFactor = cardiacDrift > 3 ? Math.max(0.5, 1 - (cardiacDrift - 3) * 0.1) : 1

  const raceEstimates: RaceEstimate[] = []

  // HM estimate
  if (hmPace > 200 && hmPace < 500) {
    raceEstimates.push({
      distanceKey: 'hm',
      estimatedSecs: hmPace * 21.097,
      confidence: 0.65 * distanceFactor * driftFactor,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: `Long run steady pace ${formatPace(window.avgPace)}/km @ ${Math.round(window.avgHR)}bpm → HM pace via HR projection`,
    })
  }

  // FM estimate
  if (fmPace > 200 && fmPace < 500) {
    raceEstimates.push({
      distanceKey: 'fm',
      estimatedSecs: fmPace * 42.195,
      confidence: 0.50 * distanceFactor * driftFactor,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: `Long run → FM via HR projection${cardiacDrift > 3 ? ` (drift ${cardiacDrift.toFixed(1)}% penalised)` : ''}`,
    })
  }

  // 10K reverse Riegel (low confidence)
  if (raceEstimates.length > 0) {
    const hmEst = raceEstimates.find(e => e.distanceKey === 'hm')
    if (hmEst) {
      raceEstimates.push({
        distanceKey: '10k',
        estimatedSecs: riegelProject(hmEst.estimatedSecs, 21.097, 10, 1.06),
        confidence: 0.35 * distanceFactor,
        source: 'long_run',
        date,
        activityId: activity.id,
        method: 'Reverse Riegel from long run HM estimate',
      })
    }
  }

  if (raceEstimates.length === 0) return null

  return {
    date,
    activityId: activity.id,
    activityName: activity.name,
    distanceKm: parseFloat(distKm.toFixed(1)),
    steadyPace: parseFloat(window.avgPace.toFixed(1)),
    steadyHR: parseFloat(window.avgHR.toFixed(1)),
    cardiacDrift: parseFloat(cardiacDrift.toFixed(1)),
    windowSecs: window.windowSecs,
    raceEstimates,
  }
}

// ─── Race result detector ────────────────────────────────────────────────────

const RACE_NAME_PATTERN = /\b(race|parkrun|marathon|5k|10k|hm|half.?marathon)\b/i
const STANDARD_DISTANCES: { key: DistanceKey; km: number }[] = [
  { key: '5k', km: 5 },
  { key: '10k', km: 10 },
  { key: 'hm', km: 21.097 },
  { key: 'fm', km: 42.195 },
]

export interface RaceResultAnalysis {
  date: string
  activityId: number
  activityName: string
  matchedDistanceKey: DistanceKey
  raceTimeSecs: number
  raceEstimates: RaceEstimate[]
}

export function detectAndAnalyzeRace(activity: {
  id: number
  name: string
  start_date: string
  distance: number
  moving_time: number
  average_speed: number
  is_race?: boolean
  matched_distance_key?: string
  raw?: any
}): RaceResultAnalysis | null {
  // Detection: Strava workout_type === 1, is_race flag, or name pattern
  const isRace = activity.is_race ||
    activity.raw?.workout_type === 1 ||
    RACE_NAME_PATTERN.test(activity.name)

  if (!isRace) return null

  const distKm = activity.distance / 1000

  // Match to nearest standard distance (±10% tolerance)
  let matched: { key: DistanceKey; km: number } | null = null
  if (activity.matched_distance_key) {
    matched = STANDARD_DISTANCES.find(d => d.key === activity.matched_distance_key) ?? null
  }
  if (!matched) {
    for (const std of STANDARD_DISTANCES) {
      if (Math.abs(distKm - std.km) / std.km <= 0.10) {
        matched = std
        break
      }
    }
  }

  if (!matched) return null

  const date = activity.start_date.split('T')[0]
  const raceTimeSecs = activity.moving_time

  const raceEstimates: RaceEstimate[] = [
    {
      distanceKey: matched.key,
      estimatedSecs: raceTimeSecs,
      confidence: 0.98,
      source: 'race_result',
      date,
      activityId: activity.id,
      method: `Race result: ${activity.name}`,
    },
  ]

  // Project to other distances via Riegel with log-distance decay
  for (const std of STANDARD_DISTANCES) {
    if (std.key === matched.key) continue
    const projected = riegelProject(raceTimeSecs, matched.km, std.km)
    const distRatio = Math.abs(Math.log(std.km / matched.km))
    const confidence = 0.80 * Math.max(0.3, 1 - distRatio * 0.3)
    raceEstimates.push({
      distanceKey: std.key,
      estimatedSecs: projected,
      confidence,
      source: 'race_result',
      date,
      activityId: activity.id,
      method: `Riegel from ${matched.key} race result`,
    })
  }

  return {
    date,
    activityId: activity.id,
    activityName: activity.name,
    matchedDistanceKey: matched.key,
    raceTimeSecs,
    raceEstimates,
  }
}

// ─── Easy run trend estimator ────────────────────────────────────────────────

export function easyRunTrendEstimate(
  easyResults: EasyRunEfficiency[],
  maxHr: number = DEFAULT_MAX_HR
): RaceEstimate[] {
  // Filter to valid results from the last 6 weeks
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 42)
  const recent = easyResults
    .filter(r => !r.excludedReason && r.normalizedPaceSec > 0)
    .filter(r => new Date(r.date) >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date))

  if (recent.length < 3) return []

  // Exponential-weighted average (21-day half-life) of normalizedPaceSec
  const now = Date.now()
  const HALF_LIFE_MS = 21 * 86400000
  let weightedSum = 0
  let totalWeight = 0
  let weightedSlopeSum = 0

  for (const r of recent) {
    const ageDays = (now - new Date(r.date).getTime()) / 86400000
    const w = Math.exp(-ageDays * Math.LN2 / 21)
    weightedSum += r.normalizedPaceSec * w
    weightedSlopeSum += r.slope * w
    totalWeight += w
  }

  const avgNormalizedPace = weightedSum / totalWeight
  const avgSlope = weightedSlopeSum / totalWeight

  // Project from easy HR (150bpm) to race HR using average slope
  // 5K race HR ≈ 96% max, 10K ≈ 92%, HM ≈ 87%
  const raceHRs: Record<DistanceKey, number> = {
    '5k': maxHr * 0.96,
    '10k': maxHr * 0.92,
    'hm': maxHr * 0.87,
    'fm': maxHr * 0.82,
  }

  const latestRun = recent[recent.length - 1]
  const estimates: RaceEstimate[] = []

  for (const dk of ['5k', '10k', 'hm', 'fm'] as DistanceKey[]) {
    const raceHR = raceHRs[dk]
    const racePace = avgNormalizedPace + avgSlope * (raceHR - REF_HR)
    if (racePace < 150 || racePace > 450) continue
    const km = DISTANCE_KM[dk]
    estimates.push({
      distanceKey: dk,
      estimatedSecs: racePace * km,
      confidence: 0.40,
      source: 'easy_trend',
      date: latestRun.date,
      activityId: latestRun.activityId,
      method: `Easy run trend: ${formatPace(avgNormalizedPace)}/km @ 150bpm → race HR projection`,
    })
  }

  return estimates
}

// ─── Signal combiner ─────────────────────────────────────────────────────────

export function combineEstimates(
  allEstimates: RaceEstimate[],
  distanceKey: DistanceKey
): CombinedEstimate | null {
  const matching = allEstimates.filter(e => e.distanceKey === distanceKey)
  if (matching.length === 0) return null

  const now = Date.now()
  const HALF_LIFE_DAYS = 42

  // Apply recency weighting
  const weighted = matching.map(e => {
    const ageDays = (now - new Date(e.date).getTime()) / 86400000
    const recencyWeight = Math.exp(-ageDays * Math.LN2 / HALF_LIFE_DAYS)
    return {
      ...e,
      weight: e.confidence * recencyWeight,
    }
  })

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0)
  if (totalWeight === 0) return null

  const bestEstimateSecs = weighted.reduce((s, w) => s + w.estimatedSecs * w.weight, 0) / totalWeight

  // Confidence: best individual weight + diversity bonus
  const bestWeight = Math.max(...weighted.map(w => w.weight))
  const sourceTypes = new Set(weighted.map(w => w.source))
  const diversityBonus = Math.min(0.15, (sourceTypes.size - 1) * 0.05)
  const confidence = Math.min(1, bestWeight + diversityBonus)

  return {
    bestEstimateSecs,
    confidence,
    contributors: weighted
      .sort((a, b) => b.weight - a.weight)
      .map(w => ({
        source: w.source,
        estimatedSecs: w.estimatedSecs,
        weight: parseFloat(w.weight.toFixed(3)),
        date: w.date,
        activityId: w.activityId,
        method: w.method,
      })),
  }
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
  maxHr: number = DEFAULT_MAX_HR
): {
  intervalEstimates: FiveKEstimate[]
  thresholdEstimates: FiveKEstimate[]
  longRunAnalyses: LongRunAnalysis[]
  raceAnalyses: RaceResultAnalysis[]
  easyRunResults: EasyRunEfficiency[]
  easyTrendEstimates: RaceEstimate[]
  allRaceEstimates: RaceEstimate[]
  combined: Record<DistanceKey, CombinedEstimate | null>
} {
  // Run individual analyzers
  const intervalEstimates = analyzeAllIntervalSessions(
    intervalActivities.filter((a: any) => !a.excluded_from_analysis), maxHr
  )
  const thresholdEstimates = thresholdActivities
    .filter((a: any) => !a.excluded_from_analysis)
    .map(a => analyzeThresholdSession(a, maxHr))
    .filter(Boolean) as FiveKEstimate[]

  const longRunAnalyses = longRunActivities
    .filter((a: any) => !a.excluded_from_analysis)
    .map(a => analyzeLongRun(a, maxHr))
    .filter(Boolean) as LongRunAnalysis[]

  const raceAnalyses = raceActivities
    .map(a => detectAndAnalyzeRace(a))
    .filter(Boolean) as RaceResultAnalysis[]

  const easyRunResults = analyzeAllEasyRuns(easyActivities.filter((a: any) => !a.excluded_from_analysis))
  const easyTrendEstimates = easyRunTrendEstimate(easyRunResults, maxHr)

  // Collect all race estimates
  const allRaceEstimates: RaceEstimate[] = [
    ...intervalEstimates.flatMap(e => e.raceEstimates ?? []),
    ...thresholdEstimates.flatMap(e => e.raceEstimates ?? []),
    ...longRunAnalyses.flatMap(e => e.raceEstimates),
    ...raceAnalyses.flatMap(e => e.raceEstimates),
    ...easyTrendEstimates,
  ]

  // Combine per distance
  const combined: Record<DistanceKey, CombinedEstimate | null> = {
    '5k': combineEstimates(allRaceEstimates, '5k'),
    '10k': combineEstimates(allRaceEstimates, '10k'),
    'hm': combineEstimates(allRaceEstimates, 'hm'),
    'fm': combineEstimates(allRaceEstimates, 'fm'),
  }

  return {
    intervalEstimates,
    thresholdEstimates,
    longRunAnalyses,
    raceAnalyses,
    easyRunResults,
    easyTrendEstimates,
    allRaceEstimates,
    combined,
  }
}
