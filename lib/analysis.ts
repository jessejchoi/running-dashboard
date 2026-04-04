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
  projected?: boolean         // true = Riegel projection from a different-distance race
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
  /** Per-source aggregated estimate (after drop-slowest + recency weighting) */
  sourceAverages: Partial<Record<EstimateSource, number>>
  /** Effective weights per source (0 for missing sources, redistributed) */
  effectiveWeights: Record<EstimateSource, number>
  /** Endurance readiness penalty applied (0 = none, e.g. 0.03 = 3% added) */
  endurancePenaltyPct?: number
  /** Longest run in last 3 months (km) */
  longestRecentRunKm?: number
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
 *
 * Calibrated so typical sessions (WR=2, 180s reps) get ~+4% correction.
 * Duration and HR carry more weight to differentiate short vs long reps
 * and high vs low effort.
 *
 * Clamped to [1.0, 1.15]
 */
function newRepCorrection(workRestRatio: number, repDurationSecs: number, repHR?: number, maxHr: number = DEFAULT_MAX_HR): number {
  // Rest adjustment: more rest = artificially faster
  // WR=1→+5%, WR=2→+3.3%, WR=3→+2.5%, WR=5→+1.7%
  const restAdjust = 0.10 / (1 + workRestRatio)

  // Duration adjustment: short reps tap anaerobic systems
  // 48s(200m)→+10.4%, 96s(400m)→+8.8%, 240s(1km)→+4%, 360s+→0%
  const durationAdjust = 0.12 * Math.max(0, 1 - repDurationSecs / 360)

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

// Rest-only correction for structured threshold (avoids double-dip with Daniels)
function restOnlyCorrection(workRestRatio: number): number {
  return 1 + 0.04 / (1 + workRestRatio)
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

interface TimedSplit {
  tStart: number
  tEnd: number
  hr: number
  pace: number    // sec/km
  duration: number
}

function buildTimedSplits(splits: any[]): TimedSplit[] {
  const timed: TimedSplit[] = []
  let cumSec = 0
  for (const sp of splits) {
    const dur = sp.elapsed_time ?? sp.moving_time ?? 60
    if (sp.average_heartrate && sp.average_speed) {
      timed.push({
        tStart: cumSec,
        tEnd: cumSec + dur,
        hr: sp.average_heartrate,
        pace: 1000 / sp.average_speed,
        duration: dur,
      })
    }
    cumSec += dur
  }
  return timed
}

// Weighted average helpers for TimedSplit arrays
function wavg(splits: TimedSplit[], field: 'hr' | 'pace'): number {
  const totalDur = splits.reduce((s, sp) => s + sp.duration, 0)
  return totalDur > 0 ? splits.reduce((s, sp) => s + sp[field] * sp.duration, 0) / totalDur : 0
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

// Duration efficiency credit: reward longer aerobic efforts at the same HR/pace.
// Applied after 150bpm normalization. Reference = 45 min, ~5 sec/km per doubling.
const ENDURANCE_REF_MINS = 45
const ENDURANCE_DURATION_K = 5

function durationEfficiencyCredit(durationMins: number): number {
  return ENDURANCE_DURATION_K * Math.log2(Math.max(durationMins, 5) / ENDURANCE_REF_MINS)
}

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

  const normalizedPaceRaw = avgPace + slope * (REF_HR - avgHR)
  if (normalizedPaceRaw < 200 || normalizedPaceRaw > 540) return stub('Normalised pace out of range — check HR data')
  // Apply duration efficiency credit: longer efforts at the same HR/pace = more fit.
  // Use moving_time as a proxy for when the steady window occurred (window is near end of run).
  const normalizedPaceSec = normalizedPaceRaw - durationEfficiencyCredit(activity.moving_time / 60)

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

export type LongRunStructure = 'steady' | 'progression' | 'fast_middle'

export interface FastBlock {
  startSec: number
  endSec: number
  durationSecs: number
  avgPace: number   // sec/km
  avgHR: number
  pctFasterThanBaseline: number
}

export interface DriftWindow {
  avgPace: number     // sec/km
  avgHR: number
  adjustedHR?: number // HR normalised to early-window pace (late window only, when pace changed)
  startSec: number
  endSec: number
}

export interface LongRunAnalysis {
  date: string
  activityId: number
  activityName: string
  distanceKm: number
  overallPace: number     // sec/km — full run average (for reference)
  overallHR: number       // full run average HR (for reference)
  steadyPace: number      // sec/km from pre-fast steady window (last 15 min)
  steadyHR: number
  cardiacDrift: number       // % HR increase early window → late window (pre-fast portion only)
  driftReliable: boolean
  driftPaceAdjusted: boolean // true when drift was normalised for a pace change between windows
  driftReason?: string
  earlyWindow?: DriftWindow   // ~30% mark window used for drift comparison
  lateWindow?: DriftWindow    // last 15 min window used for drift comparison
  windowSecs: number
  runStructure: LongRunStructure
  fastBlock?: FastBlock               // primary (longest) fast/progression block — used for estimates
  allFastBlocks?: FastBlock[]         // all detected fast blocks (for display; primary is longest)
  fatigueCredit?: number              // sec/km pace bonus applied to primary block estimates
  fastBlockEstimates?: RaceEstimate[] // threshold-style estimates from the fast block
  residualElevation?: number          // % HR elevation at easy pace after fast block (fast_middle only)
  raceEstimates: RaceEstimate[]
  steadyDurationSecs: number          // seconds from run start to end of steady portion (= fastBlock.startSec or preFastDuration)
}

// Compare HR between an early window (~30% into the supplied segment) and the
// last 15 min. Accepts a pre-built TimedSplit array so callers can pass only
// the steady portion of a run (stripping any fast block beforehand).
function computeCardiacDrift(timed: TimedSplit[], totalSecs: number): {
  drift: number
  reliable: boolean
  paceAdjusted: boolean
  reason?: string
  earlyWindow?: DriftWindow
  lateWindow?: DriftWindow
} {
  const MIN_RUN_SECS    = 55 * 60
  const WINDOW_SECS     = 15 * 60
  const MIN_GAP_SECS    = 20 * 60   // 20 min is enough separation to measure drift
  // sec/km per bpm — same slope used in HR projection elsewhere in this file
  const HR_PACE_SLOPE   = 2.5

  if (timed.length < 4)         return { drift: 0, reliable: false, paceAdjusted: false, reason: 'no split data' }
  if (totalSecs < MIN_RUN_SECS) return { drift: 0, reliable: false, paceAdjusted: false, reason: 'segment too short for drift (<55 min)' }

  const earlyStart = totalSecs * 0.30
  const earlyEnd   = earlyStart + WINDOW_SECS
  const lateStart  = totalSecs - WINDOW_SECS
  const lateEnd    = totalSecs

  if (lateStart - earlyEnd < MIN_GAP_SECS) {
    return { drift: 0, reliable: false, paceAdjusted: false, reason: 'windows too close (<20 min apart)' }
  }

  // Overlap-based filter: include any split that intersects the window, not just
  // splits fully contained within it. Per-km splits can be 5-8 min wide, so a
  // "fully contained" filter often lets only 1 split through per window.
  const earlySplits = timed.filter(s => s.tStart < earlyEnd && s.tEnd > earlyStart)
  const lateSplits  = timed.filter(s => s.tStart < lateEnd   && s.tEnd > lateStart)

  if (earlySplits.length < 2 || lateSplits.length < 2) {
    return { drift: 0, reliable: false, paceAdjusted: false, reason: 'insufficient splits in comparison windows' }
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

  return { drift, reliable: true, paceAdjusted, reason, earlyWindow: earlyWindowData, lateWindow: lateWindowData }
}

// ─── Fast block detection ─────────────────────────────────────────────────────

const LONG_RUN_MIN_BLOCK_SECS = 8 * 60
// Minimum % faster than the first-30-min baseline to qualify as a fast block.
const FAST_BLOCK_MIN_PCT_FASTER = 5

// Fatigue credit applied to fast block pace estimates.
// A fast block run after 90 min represents better fitness than the same pace fresh.
// Reference = 30 min of running before the block; ~8 s/km credit per doubling.
const FATIGUE_REF_SECS  = 30 * 60
const FATIGUE_CREDIT_K  = 8

// Weighted average pace of the first ~30 min of timed splits (warm-up baseline).
function getFirst30MinBaseline(timed: TimedSplit[]): number | null {
  const TARGET_SECS = 30 * 60
  const splits: TimedSplit[] = []
  let cumDur = 0
  for (const sp of timed) {
    splits.push(sp)
    cumDur += sp.duration
    if (cumDur >= TARGET_SECS) break
  }
  if (splits.length < 2) return null
  return wavg(splits, 'pace')
}

// Find the fastest user-created lap ≥5 min.
// User-created laps are distinguished from auto km-splits by distance not near 1 km
// (heuristic: dist > 300 m and |dist − 1000| > 200 m).
function detectUserLapFastBlock(laps: any[]): FastBlock | null {
  const MIN_USER_LAP_SECS = 5 * 60

  // Build lap start times from cumulative elapsed time
  let cumSec = 0
  const lapTimings: { lap: any; startSec: number; endSec: number }[] = []
  for (const lap of laps) {
    const dur = lap.elapsed_time ?? lap.moving_time ?? 0
    lapTimings.push({ lap, startSec: cumSec, endSec: cumSec + dur })
    cumSec += dur
  }

  // Filter: user laps only, ≥5 min, have speed data
  const userLaps = lapTimings.filter(({ lap }) => {
    const dist = lap.distance ?? 0
    const dur  = lap.elapsed_time ?? lap.moving_time ?? 0
    return dist > 300 && Math.abs(dist - 1000) > 200 && dur >= MIN_USER_LAP_SECS && (lap.average_speed ?? 0) > 0
  })
  if (userLaps.length === 0) return null

  // Pick fastest by average speed
  const fastest = userLaps.reduce((a, b) =>
    (b.lap.average_speed ?? 0) > (a.lap.average_speed ?? 0) ? b : a
  )
  const dur = fastest.lap.elapsed_time ?? fastest.lap.moving_time ?? 0

  return {
    startSec:             fastest.startSec,
    endSec:               fastest.endSec,
    durationSecs:         dur,
    avgPace:              parseFloat((1000 / fastest.lap.average_speed).toFixed(1)),
    avgHR:                parseFloat((fastest.lap.average_heartrate ?? 0).toFixed(1)),
    pctFasterThanBaseline: 0, // filled in by caller after baseline is known
  }
}

// Find the fast block anchored at the peak (fastest) split, then expand outward
// as long as adjacent splits stay within a pace buffer of the peak.
// This correctly handles multiple progressions — it finds the fastest single
// effort and the continuous window where that effort is sustained, rather than
// averaging across two separate hard stretches.
function detectFastestWindowBlock(
  timed: TimedSplit[],
  baselinePace: number,
  minBlockSecs: number,
  minPctFaster: number,
): FastBlock | null {
  if (timed.length < 2) return null

  // Step 1: find the single fastest split
  let peakIdx = 0
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].pace < timed[peakIdx].pace) peakIdx = i
  }
  const peakPace = timed[peakIdx].pace

  // Step 2: include any adjacent split within 8% of peak pace (or 15 s/km, whichever is larger)
  const buffer = Math.max(peakPace * 0.08, 15)
  const cutoff = peakPace + buffer

  let start = peakIdx
  let end   = peakIdx
  while (start > 0 && timed[start - 1].pace <= cutoff) start--
  while (end < timed.length - 1 && timed[end + 1].pace <= cutoff) end++

  const windowSplits = timed.slice(start, end + 1)
  const cumDur = windowSplits.reduce((s, sp) => s + sp.duration, 0)
  if (cumDur < minBlockSecs) return null

  const avgPace   = wavg(windowSplits, 'pace')
  const pctFaster = (baselinePace - avgPace) / baselinePace * 100
  if (pctFaster < minPctFaster) return null

  return {
    startSec:              timed[start].tStart,
    endSec:                timed[end].tEnd,
    durationSecs:          timed[end].tEnd - timed[start].tStart,
    avgPace:               parseFloat(avgPace.toFixed(1)),
    avgHR:                 parseFloat(wavg(windowSplits, 'hr').toFixed(1)),
    pctFasterThanBaseline: parseFloat(pctFaster.toFixed(1)),
  }
}

// Treat the fast block like a continuous threshold run — same Daniels ratio
// with a 20% confidence discount (pre-fatigued) but a fatigue credit applied
// to pace: blocks deeper into the run represent higher fitness than the same
// pace run fresh.
function fastBlockThresholdEstimates(
  block: FastBlock,
  activityId: number,
  date: string,
  maxHr: number,
): RaceEstimate[] {
  if (block.durationSecs < LONG_RUN_MIN_BLOCK_SECS) return []
  if (block.avgPace < 180 || block.avgPace > 420) return []

  // Fatigue credit: blocks later in the run get a pace bonus before estimation.
  const fatigueCredit = FATIGUE_CREDIT_K * Math.log2(
    Math.max(block.startSec, 10 * 60) / FATIGUE_REF_SECS
  )
  const adjustedPace = block.avgPace - fatigueCredit

  const ratio    = continuousDanielsRatio(block.avgHR, maxHr)
  const fiveKPac = adjustedPace * ratio
  const est5K    = Math.max(840, Math.min(3000, fiveKPac * 5))
  const DISCOUNT = 0.80
  const label    = `Long run fast block (${(block.durationSecs / 60).toFixed(0)} min @ ${formatPace(block.avgPace)}/km, fatigue +${fatigueCredit.toFixed(1)}s credit)`

  return [
    {
      distanceKey: '5k',
      estimatedSecs: est5K,
      confidence: THRESHOLD_CONFIDENCE['5k']  * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} via Daniels ${ratio.toFixed(3)}`,
    },
    {
      distanceKey: '10k',
      estimatedSecs: adjustedPace * THRESHOLD_TO_10K * 10,
      confidence: THRESHOLD_CONFIDENCE['10k'] * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} → 10K via threshold ratio`,
    },
    {
      distanceKey: 'hm',
      estimatedSecs: adjustedPace * THRESHOLD_TO_HM * 21.097,
      confidence: THRESHOLD_CONFIDENCE['hm']  * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} ≈ HM race pace`,
    },
    {
      distanceKey: 'fm',
      estimatedSecs: riegelProject(adjustedPace * THRESHOLD_TO_HM * 21.097, 21.097, 42.195, 1.07),
      confidence: THRESHOLD_CONFIDENCE['fm']  * DISCOUNT,
      source: 'threshold',
      date,
      activityId,
      method: `${label} → FM via Riegel`,
    },
  ]
}

// Residual elevation: % HR elevation at easy pace after a fast block recovers.
// Only meaningful for fast_middle — compares the post-recovery easy HR to the
// pre-block easy HR at the same pace (±10%). Tracked separately, not used in
// race time prediction.
function computeResidualElevation(
  timed: TimedSplit[],
  block: FastBlock,
  preFastAvgHR: number,
  preFastAvgPace: number,
  totalSecs: number,
): number | undefined {
  const RECOVERY_SKIP = 10 * 60  // allow 10 min for HR to settle post-block
  const WINDOW_SECS   = 15 * 60
  const PACE_TOLERANCE = 0.10
  const TOLERANCE      = 45

  const postStart = block.endSec + RECOVERY_SKIP
  const postEnd   = postStart + WINDOW_SECS
  if (postEnd > totalSecs) return undefined

  const postSplits = timed.filter(
    s => s.tStart >= postStart - TOLERANCE && s.tEnd <= postEnd + TOLERANCE
  )
  if (postSplits.length < 2) return undefined

  const postHR   = wavg(postSplits, 'hr')
  const postPace = wavg(postSplits, 'pace')

  const paceRatio = postPace / preFastAvgPace
  if (paceRatio < 1 - PACE_TOLERANCE || paceRatio > 1 + PACE_TOLERANCE) return undefined

  return preFastAvgHR > 0
    ? parseFloat((((postHR - preFastAvgHR) / preFastAvgHR) * 100).toFixed(1))
    : undefined
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
  run_type?: string
}, maxHr: number = DEFAULT_MAX_HR): LongRunAnalysis | null {
  const distKm      = activity.distance / 1000
  const date        = activity.start_date.split('T')[0]
  const baselinePace = activity.average_speed ? 1000 / activity.average_speed : 999
  if (!activity.average_heartrate) return null

  // Build timed-split array once; used by all sub-analyses
  const timed = buildTimedSplits(activity.splits ?? [])

  // ── Detect fast block ────────────────────────────────────────────────────
  // Only look for fast blocks in "Long Run with Speed" (long_progressive).
  // long_easy runs are explicitly steady — never detect a fast block there.
  const isProgressive = activity.run_type === 'long_progressive'

  let runStructure: LongRunStructure = isProgressive ? 'progression' : 'steady'
  let fastBlock: FastBlock | undefined
  let fastBlockEstimates: RaceEstimate[] | undefined
  let residualElevation: number | undefined
  const allFastBlocks: FastBlock[] = []

  // Splits and duration of the pre-fast steady portion.
  // Use the last split's tEnd rather than activity.moving_time — splits use
  // elapsed_time (includes pauses) while moving_time excludes them, so using
  // moving_time would push the late window boundary past where splits exist.
  let preFastTimed    = timed
  let preFastDuration = timed.length > 0 ? timed[timed.length - 1].tEnd : activity.moving_time

  if (isProgressive) {
    // Baseline = average pace of first ~30 min (warm-up phase), fallback to overall avg.
    const blockBaseline = getFirst30MinBaseline(timed) ?? baselinePace

    // Priority 1: user-created laps (non-km splits — runner manually pressed lap button).
    const userLapBlock = detectUserLapFastBlock(activity.laps ?? [])
    if (userLapBlock) {
      userLapBlock.pctFasterThanBaseline = parseFloat(
        ((blockBaseline - userLapBlock.avgPace) / blockBaseline * 100).toFixed(1)
      )
      fastBlock = userLapBlock
    }

    // Priority 2: fastest continuous window over km splits.
    if (!fastBlock) {
      fastBlock = detectFastestWindowBlock(
        timed, blockBaseline, LONG_RUN_MIN_BLOCK_SECS, FAST_BLOCK_MIN_PCT_FASTER
      ) ?? undefined
    }

    if (fastBlock) {
      allFastBlocks.push(fastBlock)
      runStructure = fastBlock.startSec > preFastDuration * 0.75 ? 'progression' : 'fast_middle'

      // Trim to pre-fast portion for drift / steady window analysis
      preFastTimed    = timed.filter(s => s.tEnd <= fastBlock!.startSec)
      preFastDuration = fastBlock.startSec

      fastBlockEstimates = fastBlockThresholdEstimates(fastBlock, activity.id, date, maxHr)

      // Residual elevation only for fast_middle (need easy running after block)
      if (runStructure === 'fast_middle' && preFastTimed.length >= 2) {
        const preFastAvgHR   = wavg(preFastTimed, 'hr')
        const preFastAvgPace = wavg(preFastTimed, 'pace')
        residualElevation = computeResidualElevation(
          timed, fastBlock, preFastAvgHR, preFastAvgPace, activity.moving_time
        )
      }
    }
  }

  // ── Steady window from pre-fast portion ─────────────────────────────────
  // Take the last 15 min of the pre-fast splits for the HR-projection window.
  let window: SteadyWindow | null = null

  if (preFastTimed.length >= 2 && preFastDuration >= 600) {
    const TARGET_WINDOW = 15 * 60
    const windowSplits: TimedSplit[] = []
    let wSecs = 0
    for (let i = preFastTimed.length - 1; i >= 0 && wSecs < TARGET_WINDOW; i--) {
      windowSplits.unshift(preFastTimed[i])
      wSecs += preFastTimed[i].duration
    }
    const useSplits = windowSplits.length >= 1 ? windowSplits : preFastTimed
    const totalDur  = useSplits.reduce((s, sp) => s + sp.duration, 0)
    if (totalDur > 0) {
      window = {
        avgPace: wavg(useSplits, 'pace'),
        avgHR:   wavg(useSplits, 'hr'),
        splits:  useSplits.map(sp => ({ paceSecPerKm: sp.pace, hr: sp.hr, duration: sp.duration })),
        windowSecs: totalDur,
      }
    }
  }

  // Fallback to lap-based extraction for steady runs with no useful splits
  if (!window && runStructure === 'steady') {
    window = extractSteadyWindow(activity)
  }

  // Final fallback to whole-run averages
  if (!window && activity.average_heartrate && activity.average_speed) {
    window = {
      avgPace: baselinePace,
      avgHR:   activity.average_heartrate,
      splits:  [],
      windowSecs: activity.moving_time,
    }
  }

  // If no usable steady window but we have fast block estimates, still return
  if (!window || window.windowSecs < 600) {
    if (fastBlockEstimates && fastBlockEstimates.length > 0) {
      const fatigueCredit = fastBlock
        ? FATIGUE_CREDIT_K * Math.log2(Math.max(fastBlock.startSec, 10 * 60) / FATIGUE_REF_SECS)
        : undefined
      return {
        date,
        activityId:   activity.id,
        activityName: activity.name,
        distanceKm:   parseFloat(distKm.toFixed(1)),
        overallPace:  parseFloat(baselinePace.toFixed(1)),
        overallHR:    activity.average_heartrate ?? 0,
        steadyPace:   parseFloat(baselinePace.toFixed(1)),
        steadyHR:     activity.average_heartrate ?? 0,
        cardiacDrift: 0,
        driftReliable: false,
        driftPaceAdjusted: false,
        driftReason:  'no steady window — fast block only',
        windowSecs:   0,
        runStructure,
        fastBlock,
        allFastBlocks,
        fatigueCredit,
        fastBlockEstimates,
        residualElevation,
        raceEstimates: fastBlockEstimates,
        steadyDurationSecs: preFastDuration,
      }
    }
    return null
  }

  // ── Cardiac drift on pre-fast timed splits ───────────────────────────────
  const driftResult  = computeCardiacDrift(preFastTimed, preFastDuration)
  const cardiacDrift = driftResult.drift
  const overallPace  = baselinePace
  const overallHR    = activity.average_heartrate ?? 0

  // ── Race projection from steady window ───────────────────────────────────
  const hmRaceHR = maxHr * 0.87
  const fmRaceHR = maxHr * 0.82

  const hmHRDiff     = (hmRaceHR - window.avgHR) / maxHr * 100
  const fmHRDiff     = (fmRaceHR - window.avgHR) / maxHr * 100
  const hmHRGapBpm   = Math.abs(hmRaceHR - window.avgHR)
  const fmHRGapBpm   = Math.abs(fmRaceHR - window.avgHR)

  const hmPace = window.avgPace - hmHRDiff * 2.5 * (1 + 0.005 * hmHRGapBpm)
  const fmPace = window.avgPace - fmHRDiff * 2.5 * (1 + 0.005 * fmHRGapBpm)

  const hmHRGapPenalty = Math.max(0.3, 1 - (hmHRGapBpm - 10) * 0.02)
  const fmHRGapPenalty = Math.max(0.3, 1 - (fmHRGapBpm - 10) * 0.02)

  // Distance factor based on pre-fast km
  const preFastKm       = preFastTimed.reduce((s, sp) => s + sp.duration / sp.pace, 0)
  const effectiveDistKm = preFastKm > 0 ? preFastKm : distKm
  const distanceFactor  = Math.min(1, effectiveDistKm / 25)

  // Drift factor: only penalise when drift is reliably measured and high
  const driftFactor = driftResult.reliable && cardiacDrift > 3
    ? Math.max(0.5, 1 - (cardiacDrift - 3) * 0.1)
    : 1
  const driftUnknownPenalty = driftResult.reliable ? 1 : 0.85

  const steadyEstimates: RaceEstimate[] = []

  if (hmPace > 200 && hmPace < 500) {
    steadyEstimates.push({
      distanceKey: 'hm',
      estimatedSecs: hmPace * 21.097,
      confidence: 0.65 * distanceFactor * driftFactor * hmHRGapPenalty,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: `Steady pace ${formatPace(window.avgPace)}/km @ ${Math.round(window.avgHR)}bpm → HM via HR projection`,
    })
  }

  if (fmPace > 200 && fmPace < 500) {
    steadyEstimates.push({
      distanceKey: 'fm',
      estimatedSecs: fmPace * 42.195,
      confidence: 0.50 * distanceFactor * driftFactor * driftUnknownPenalty * fmHRGapPenalty,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: `Steady pace → FM via HR projection${driftResult.reliable && cardiacDrift > 3 ? ` (drift ${cardiacDrift.toFixed(1)}% penalised)` : ''}`,
    })
  }

  const hmSteady = steadyEstimates.find(e => e.distanceKey === 'hm')
  if (hmSteady) {
    steadyEstimates.push({
      distanceKey: '10k',
      estimatedSecs: riegelProject(hmSteady.estimatedSecs, 21.097, 10, 1.06),
      confidence: 0.35 * distanceFactor,
      source: 'long_run',
      date,
      activityId: activity.id,
      method: 'Reverse Riegel from steady-pace HM estimate',
    })
  }

  // When there's a fast block, prefer it as the primary race estimate —
  // threshold-based Daniels method from an actual hard effort is more
  // reliable than projecting from easy-pace HR for a mixed-effort run.
  const raceEstimates = fastBlockEstimates && fastBlockEstimates.length > 0
    ? fastBlockEstimates
    : steadyEstimates
  if (raceEstimates.length === 0) return null

  const fatigueCredit = fastBlock
    ? FATIGUE_CREDIT_K * Math.log2(Math.max(fastBlock.startSec, 10 * 60) / FATIGUE_REF_SECS)
    : undefined

  return {
    date,
    activityId:   activity.id,
    activityName: activity.name,
    distanceKm:   parseFloat(distKm.toFixed(1)),
    overallPace:  parseFloat(overallPace.toFixed(1)),
    overallHR:    parseFloat(overallHR.toFixed(1)),
    steadyPace:   parseFloat(window.avgPace.toFixed(1)),
    steadyHR:     parseFloat(window.avgHR.toFixed(1)),
    cardiacDrift: parseFloat(cardiacDrift.toFixed(1)),
    driftReliable: driftResult.reliable,
    driftPaceAdjusted: driftResult.paceAdjusted,
    driftReason:  driftResult.reason,
    earlyWindow:  driftResult.earlyWindow,
    lateWindow:   driftResult.lateWindow,
    windowSecs:   window.windowSecs,
    runStructure,
    fastBlock,
    allFastBlocks,
    fatigueCredit,
    fastBlockEstimates,
    residualElevation,
    raceEstimates,
    steadyDurationSecs: preFastDuration,
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
      projected: false,
    },
  ]

  // Project to other distances via Riegel with log-distance decay
  for (const std of STANDARD_DISTANCES) {
    if (std.key === matched.key) continue
    const projectedSecs = riegelProject(raceTimeSecs, matched.km, std.km)
    const distRatio = Math.abs(Math.log(std.km / matched.km))
    const confidence = 0.80 * Math.max(0.3, 1 - distRatio * 0.3)
    raceEstimates.push({
      distanceKey: std.key,
      estimatedSecs: projectedSecs,
      confidence,
      source: 'race_result',
      date,
      activityId: activity.id,
      method: `Riegel from ${matched.key} race result`,
      projected: true,
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
    const hrGap = raceHR - REF_HR

    // Mild amplification: at low intensity each bpm is worth more pace,
    // so larger HR gaps get a slightly bigger per-bpm adjustment.
    // ~5% boost at 10bpm gap, ~15% at 30bpm, ~20% at 40bpm.
    const ampFactor = 1 + 0.005 * hrGap
    const racePace = avgNormalizedPace + avgSlope * hrGap * ampFactor
    if (racePace < 150 || racePace > 450) continue

    // HR gap confidence penalty: larger extrapolation = less reliable
    const hrGapPenalty = Math.max(0.3, 1 - (hrGap - 15) * 0.02)  // full at ≤15bpm, 0.3 at 50bpm
    const baseConfidence = 0.40

    const km = DISTANCE_KM[dk]
    estimates.push({
      distanceKey: dk,
      estimatedSecs: racePace * km,
      confidence: baseConfidence * hrGapPenalty,
      source: 'easy_trend',
      date: latestRun.date,
      activityId: latestRun.activityId,
      method: `Easy run trend: ${formatPace(avgNormalizedPace)}/km @ 150bpm → race HR projection`,
    })
  }

  return estimates
}

// ─── Signal combiner ─────────────────────────────────────────────────────────

/** Fixed training source weights per distance */
const TRAINING_WEIGHTS: Record<DistanceKey, Record<EstimateSource, number>> = {
  '5k':  { interval: 0.75, threshold: 0.20, easy_trend: 0.00, long_run: 0.00, race_result: 0.05 },
  '10k': { interval: 0.40, threshold: 0.40, easy_trend: 0.05, long_run: 0.05, race_result: 0.10 },
  'hm':  { interval: 0.10, threshold: 0.35, easy_trend: 0.20, long_run: 0.25, race_result: 0.10 },
  'fm':  { interval: 0.05, threshold: 0.25, easy_trend: 0.30, long_run: 0.30, race_result: 0.10 },
}

/** Get the fixed weight for a source at a distance */
export function getSourceWeight(distanceKey: DistanceKey, source: EstimateSource): number {
  return TRAINING_WEIGHTS[distanceKey][source]
}

/**
 * Get effective weights after redistributing missing sources' weights.
 * Sources with no data get 0; their weight is redistributed proportionally.
 */
export function getEffectiveWeights(
  distanceKey: DistanceKey,
  availableSources: EstimateSource[]
): Record<EstimateSource, number> {
  const base = TRAINING_WEIGHTS[distanceKey]
  const allSources: EstimateSource[] = ['interval', 'threshold', 'easy_trend', 'long_run', 'race_result']
  const available = new Set(availableSources)
  const totalAvailable = allSources.filter(s => available.has(s)).reduce((sum, s) => sum + base[s], 0)

  const result: Record<EstimateSource, number> = { interval: 0, threshold: 0, easy_trend: 0, long_run: 0, race_result: 0 }
  if (totalAvailable === 0) return result
  for (const s of allSources) {
    result[s] = available.has(s) ? base[s] / totalAvailable : 0
  }
  return result
}

/**
 * Weighted average helper.
 * Each item gets: recencyWeight × speedBonus.
 * - recencyWeight: most recent (index 0) = N, next = N-1, ..., last = 1
 * - speedBonus: faster estimates (lower secs) get up to 1.5× weight.
 *   Slowest in the set = 1.0×, fastest = 1.5×, linear interpolation.
 */
function recencySpeedAvg(items: RaceEstimate[]): number {
  if (items.length === 1) return items[0].estimatedSecs
  const n = items.length
  const fastest = Math.min(...items.map(it => it.estimatedSecs))
  const slowest = Math.max(...items.map(it => it.estimatedSecs))
  const range = slowest - fastest
  let totalW = 0, totalS = 0
  items.forEach((item, i) => {
    const recency = n - i // items[0] is most recent
    const speedBonus = range > 0 ? 1 + 0.5 * (1 - (item.estimatedSecs - fastest) / range) : 1
    const w = recency * speedBonus
    totalW += w
    totalS += item.estimatedSecs * w
  })
  return totalS / totalW
}

/**
 * Per-source aggregation: drop slowest + recency/speed weighting.
 * - Interval/Threshold: last 5, drop 1 slowest, weight by recency + speed
 * - Easy trend: last 10, drop 4 slowest, weight by recency + speed
 * - Long run / Race: simple recency + speed weighted average (no dropping)
 */
function aggregateSource(
  items: RaceEstimate[],
  source: EstimateSource
): number | null {
  if (items.length === 0) return null

  // Sort by date descending (most recent first)
  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date))

  if (source === 'interval' || source === 'threshold') {
    const recent = sorted.slice(0, 5)
    if (recent.length <= 1) return recent[0].estimatedSecs
    // Drop the slowest (highest estimatedSecs)
    const slowestIdx = recent.reduce((maxI, item, i) =>
      item.estimatedSecs > recent[maxI].estimatedSecs ? i : maxI, 0)
    const kept = recent.filter((_, i) => i !== slowestIdx)
    return recencySpeedAvg(kept)
  }

  if (source === 'easy_trend') {
    const recent = sorted.slice(0, 10)
    if (recent.length <= 4) return recencySpeedAvg(recent)
    // Drop the 4 slowest
    const withIdx = recent.map((item, origIdx) => ({ item, origIdx }))
    withIdx.sort((a, b) => b.item.estimatedSecs - a.item.estimatedSecs)
    const dropIndices = new Set(withIdx.slice(0, 4).map(w => w.origIdx))
    const kept = recent.filter((_, i) => !dropIndices.has(i))
    return recencySpeedAvg(kept)
  }

  // long_run and race_result: recency + speed weighted average
  return recencySpeedAvg(sorted)
}

export function combineEstimates(
  allEstimates: RaceEstimate[],
  distanceKey: DistanceKey,
  runsSinceRace: number = Infinity,
  longestRecentRunKm: number = 0
): CombinedEstimate | null {
  const matching = allEstimates.filter(e => e.distanceKey === distanceKey)
  if (matching.length === 0) return null

  // Group by source
  const bySource: Partial<Record<EstimateSource, RaceEstimate[]>> = {}
  // For race_result, separate direct vs projected
  const directRaceEstimates: RaceEstimate[] = []
  const projectedRaceEstimates: RaceEstimate[] = []

  for (const e of matching) {
    if (e.source === 'race_result') {
      if (e.projected) {
        projectedRaceEstimates.push(e)
      } else {
        directRaceEstimates.push(e)
      }
    }
    if (!bySource[e.source]) bySource[e.source] = []
    bySource[e.source]!.push(e)
  }

  // Step 1: Per-source aggregation with drop-slowest + recency
  // For race_result source, we aggregate projected estimates only (direct race handled via override)
  const sourceAggs: Partial<Record<EstimateSource, number>> = {}
  const allSources: EstimateSource[] = ['interval', 'threshold', 'easy_trend', 'long_run']

  for (const src of allSources) {
    const items = bySource[src]
    if (!items || items.length === 0) continue
    const agg = aggregateSource(items, src)
    if (agg !== null) sourceAggs[src] = agg
  }

  // For race_result in training weights: use projected race estimates only
  if (projectedRaceEstimates.length > 0) {
    const agg = aggregateSource(projectedRaceEstimates, 'race_result')
    if (agg !== null) sourceAggs['race_result'] = agg
  }

  // Step 2: Cross-source blending with fixed weights
  const trainingWeights = TRAINING_WEIGHTS[distanceKey]
  const availableSources = (Object.keys(sourceAggs) as EstimateSource[])

  if (availableSources.length === 0 && directRaceEstimates.length === 0) return null

  // Calculate training estimate (from non-race sources + projected race)
  let trainingEstimate: number | null = null
  if (availableSources.length > 0) {
    // Redistribute weights of missing sources proportionally
    const totalAvailableWeight = availableSources.reduce((s, src) => s + trainingWeights[src], 0)
    if (totalAvailableWeight > 0) {
      let weightedSum = 0
      for (const src of availableSources) {
        const normalizedWeight = trainingWeights[src] / totalAvailableWeight
        weightedSum += sourceAggs[src]! * normalizedWeight
      }
      trainingEstimate = weightedSum
    }
  }

  // Step 3: Race result override (direct race for this exact distance)
  let bestEstimateSecs: number
  const hasDirectRace = directRaceEstimates.length > 0

  if (hasDirectRace && trainingEstimate !== null) {
    // Most recent direct race
    const sortedRaces = [...directRaceEstimates].sort((a, b) => b.date.localeCompare(a.date))
    const directRaceSecs = sortedRaces[0].estimatedSecs

    // raceWeight = max(0.10, 1.0 - runsSinceRace × 0.9 / 100)
    const raceWeight = Math.max(0.10, 1.0 - runsSinceRace * 0.9 / 100)
    bestEstimateSecs = directRaceSecs * raceWeight + trainingEstimate * (1 - raceWeight)
  } else if (hasDirectRace) {
    bestEstimateSecs = directRaceEstimates.sort((a, b) => b.date.localeCompare(a.date))[0].estimatedSecs
  } else {
    bestEstimateSecs = trainingEstimate!
  }

  // Endurance readiness penalty for HM/FM: if the runner's longest recent
  // run is short relative to the target distance, add a modest time penalty.
  // No penalty once longest run reaches a threshold (~85% of race distance).
  let endurancePenaltyPct = 0
  if (distanceKey === 'hm' || distanceKey === 'fm') {
    // HM: no penalty at 18km+, up to 3% at 0km
    // FM: no penalty at 35km+, up to 5% at 0km
    const thresholdKm = distanceKey === 'hm' ? 18 : 35
    const maxPenaltyPct = distanceKey === 'hm' ? 0.03 : 0.05
    if (longestRecentRunKm < thresholdKm) {
      const ratio = Math.min(1, longestRecentRunKm / thresholdKm)
      endurancePenaltyPct = maxPenaltyPct * (1 - ratio)
      bestEstimateSecs = bestEstimateSecs * (1 + endurancePenaltyPct)
    }
  }

  // Confidence based on source count × data depth
  // High requires 3+ sources with good data; medium requires 2+ sources
  const dataPoints = matching.length
  const bestConfidence = Math.max(...matching.map(e => e.confidence))
  const sourceCount = availableSources.length + (hasDirectRace ? 1 : 0)
  // Base from best source, small bonus per additional source, bonus for data depth
  const diversityBonus = Math.min(0.10, (sourceCount - 1) * 0.03)
  const depthBonus = Math.min(0.10, (dataPoints - 1) * 0.01)
  const confidence = Math.min(1, bestConfidence * 0.8 + diversityBonus + depthBonus)

  // Build contributors list with recency weights for display
  const now = Date.now()
  const HALF_LIFE_DAYS = 42
  const contributors = matching
    .map(e => {
      const ageDays = (now - new Date(e.date).getTime()) / 86400000
      const recencyWeight = Math.exp(-ageDays * Math.LN2 / HALF_LIFE_DAYS)
      return {
        source: e.source,
        estimatedSecs: e.estimatedSecs,
        weight: parseFloat((e.confidence * recencyWeight).toFixed(3)),
        date: e.date,
        activityId: e.activityId,
        method: e.method,
      }
    })
    .sort((a, b) => b.weight - a.weight)

  return {
    bestEstimateSecs,
    confidence,
    sourceAverages: sourceAggs,
    effectiveWeights: getEffectiveWeights(distanceKey, availableSources),
    endurancePenaltyPct: endurancePenaltyPct > 0 ? endurancePenaltyPct : undefined,
    longestRecentRunKm: longestRecentRunKm > 0 ? longestRecentRunKm : undefined,
    contributors,
  }
}

/**
 * Convert the steady portion of long runs into EasyRunEfficiency-shaped objects
 * for inclusion in the aerobic efficiency chart. Applies the same 150bpm
 * normalization plus duration credit (using steadyDurationSecs = end of steady
 * portion, not the total run time).
 *
 * Skips:
 * - long_easy runs (already captured by analyzeEasyRun)
 * - fast_middle runs (pre-block HR contaminated by the middle hard effort)
 */
export function longRunSteadyEfficiencyPoints(analyses: LongRunAnalysis[]): EasyRunEfficiency[] {
  return analyses
    .filter(lr => {
      if ((lr as any).runType === 'long_easy') return false
      if (lr.runStructure === 'fast_middle') return false
      return lr.steadyHR > 0 && lr.steadyPace > 0
    })
    .map(lr => {
      const normalizedPaceRaw = lr.steadyPace + AEROBIC_SLOPE * (REF_HR - lr.steadyHR)
      const durationMins = lr.steadyDurationSecs / 60
      const normalizedPaceSec = normalizedPaceRaw - durationEfficiencyCredit(durationMins)
      return {
        date: lr.date,
        activityId: lr.activityId,
        activityName: lr.activityName,
        runType: 'long',
        normalizedPaceSec: parseFloat(normalizedPaceSec.toFixed(1)),
        avgHR: lr.steadyHR,
        avgPaceSecPerKm: parseFloat(lr.steadyPace.toFixed(1)),
        slope: AEROBIC_SLOPE,
        r2: 0,
        splitsUsed: 0,
        splits: [],
        runKind: 'long_steady',
        steadyDurationSecs: lr.steadyDurationSecs,
      } as any as EasyRunEfficiency
    })
    .filter(p => (p as any).normalizedPaceSec > 200 && (p as any).normalizedPaceSec < 600)
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
  allActivities: { start_date: string; run_type?: string; distance?: number }[] = []
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
  // Run individual analyzers
  const intervalEstimates = analyzeAllIntervalSessions(
    intervalActivities.filter((a: any) => !a.excluded_from_analysis), maxHr
  )
  const thresholdEstimatesBase = thresholdActivities
    .filter((a: any) => !a.excluded_from_analysis)
    .map(a => analyzeThresholdSession(a, maxHr))
    .filter(Boolean) as FiveKEstimate[]

  const longRunAnalyses = longRunActivities
    .filter((a: any) => !a.excluded_from_analysis)
    .map(a => analyzeLongRun(a, maxHr))
    .filter(Boolean) as LongRunAnalysis[]

  // Adapt fast block data from long runs into FiveKEstimate shapes for threshold chart display.
  // Race estimates are already in allRaceEstimates (source: 'threshold') — don't double-count.
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

  // Long run steady portions contribute to aerobic efficiency trend.
  // longRunEfficiencyPoints are separate so the chart can render them differently (hollow dots).
  const longRunEfficiencyPoints = longRunSteadyEfficiencyPoints(longRunAnalyses)
  const easyRunResultsBase = analyzeAllEasyRuns(easyActivities.filter((a: any) => !a.excluded_from_analysis))
  const easyRunResults = [...easyRunResultsBase, ...longRunEfficiencyPoints]
  const easyTrendEstimates = easyRunTrendEstimate(easyRunResults, maxHr)

  // Collect all race estimates
  const allRaceEstimates: RaceEstimate[] = [
    ...intervalEstimates.flatMap(e => e.raceEstimates ?? []),
    ...thresholdEstimates.flatMap(e => e.raceEstimates ?? []),
    ...longRunAnalyses.flatMap(e => e.raceEstimates),
    ...raceAnalyses.flatMap(e => e.raceEstimates),
    ...easyTrendEstimates,
  ]

  // Count runs since most recent race per distance
  const runsSinceRace: Record<DistanceKey, number> = { '5k': Infinity, '10k': Infinity, 'hm': Infinity, 'fm': Infinity }
  for (const ra of raceAnalyses) {
    const dk = ra.matchedDistanceKey
    const raceDate = ra.date
    const count = allActivities.filter(a =>
      a.run_type && a.start_date.split('T')[0] > raceDate
    ).length
    // Use the smallest count (most recent race)
    if (count < runsSinceRace[dk]) {
      runsSinceRace[dk] = count
    }
  }

  // Longest run in last 3 months for endurance readiness penalty
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const threeMonthsAgoStr = threeMonthsAgo.toISOString().split('T')[0]
  const longestRecentRunKm = allActivities
    .filter(a => a.distance && a.start_date.split('T')[0] >= threeMonthsAgoStr)
    .reduce((max, a) => Math.max(max, (a.distance ?? 0) / 1000), 0)

  // Combine per distance
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
