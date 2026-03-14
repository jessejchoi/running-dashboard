/**
 * 5K time estimation from interval and threshold sessions.
 *
 * Core insight: interval reps ARE run at approximately 5K race pace.
 * Riegel extrapolation from short reps (e.g. 725m → 5K) is inappropriate —
 * the 6.9× distance jump causes the 1.06 exponent to compound massively,
 * adding ~8 minutes that don't reflect reality.
 *
 * Correct model:
 *   estimated_5K_pace = avg_rep_pace × rest_correction_factor
 *
 * rest_correction_factor accounts for the fact that rest between reps allows
 * you to run slightly faster than true race pace:
 *   factor = 1 + 0.08 × e^(-workRestRatio / 2)
 *
 * Resulting corrections:
 *   work:rest  correction   example
 *   1:1        +4.9%        equal work and rest
 *   2:1        +3.0%        twice as much work as rest
 *   3:1        +2.0%        e.g. 3min reps / 1min rest
 *   5:1        +1.0%        near race-like
 *   8:1        +0.5%        essentially a tempo run
 *
 * Duration weighting: each rep's pace is weighted by its duration.
 * A 1km rep at 4:30/km counts ~2.5× more than a 400m rep.
 *
 * For threshold continuous runs: same formula, defaults to 5:1 ratio.
 */

// ─── Formatting ───────────────────────────────────────────────────────────────

function calcVdot(secs: number): number {
  const tMin = secs / 60
  const speed = 5000 / tMin
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)
  const vo2 = -4.6 + 0.182258 * speed + 0.000104 * speed * speed
  return Math.round(vo2 / pct * 10) / 10
}

export function formatTime(secs: number): string {
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

// ─── Rest correction ──────────────────────────────────────────────────────────

const DEFAULT_MAX_HR = 195
const RACE_HR_FRACTION = 0.96  // 5K is run at ~96% HRmax

/**
 * Blended correction: duration+rest sets the base, HR fine-tunes within ±3%.
 *
 * Pure HR as primary signal was too noisy — high HR from Jakarta heat or fatigue
 * would unfairly penalise efforts. Pure duration/rest ignored actual exertion.
 *
 * This model:
 * 1. Base = anaerobic_bonus(repDur) + rest_bonus(restPerRep)
 *    - Short reps get more correction (more anaerobic contribution)
 *    - More rest gets more correction (artificially fast from recovery)
 * 2. HR modifier = ±3% max based on distance from target race HR (187 bpm)
 *    - Running near race HR → shrink correction slightly (less headroom)
 *    - Running well below race HR → expand correction slightly (more headroom)
 *    - Hot day / high HR at same pace only shifts estimate ~30s, not minutes
 *
 * Running faster always gives a better estimate regardless of HR.
 * Clamped to [1.0, 1.20].
 */
function repCorrectionFactor(restPerRepSecs: number, repDurationSecs: number, repHR?: number, maxHr: number = DEFAULT_MAX_HR): number {
  const anaerobicBonus = 0.38 * Math.exp(-repDurationSecs / 160)
  const restBonus      = 0.06 * (1 - Math.exp(-restPerRepSecs / 120))
  const base = 1 + anaerobicBonus + restBonus

  if (repHR && repHR > 100) {
    const targetHR = maxHr * RACE_HR_FRACTION
    const hrDelta = (targetHR - repHR) / targetHR  // negative if HR above target
    const hrMod = 1 - hrDelta * 0.3                // ±3% max adjustment
    return Math.min(1.20, Math.max(1.0, base * hrMod))
  }

  return Math.min(1.20, Math.max(1.0, base))
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepEffort {
  lapIndex: number
  distanceM: number
  durationSecs: number
  paceSecPerKm: number
  avgHR?: number
  correctedPaceSec: number  // pace after rest correction
  correctedSecs: number     // estimated 5K time from this rep
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MIN_EFFORT_DISTANCE = 310
const MIN_EFFORT_DURATION = 60
const MAX_EFFORT_PACE = 390    // 6:30/km — slower = recovery
const MIN_EFFORT_PACE = 160    // 2:40/km — faster = pure sprint
const RECOVERY_THRESHOLD = 40  // sec/km slower than session avg = recovery lap

// ─── Lap classification + estimation ─────────────────────────────────────────

function processLaps(
  laps: any[],
  avgPaceSecPerKm: number,
  minPace: number = MIN_EFFORT_PACE,
  maxPace: number = MAX_EFFORT_PACE
): { repEfforts: RepEffort[]; recoveryLaps: RecoveryLap[] } {
  const repEfforts: RepEffort[] = []
  const allSlowLaps: { idx: number; lap: any }[] = []

  // First pass: identify all hard effort laps and all slow laps
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
        weight: durSecs ** 2,  // squared so longer reps dominate the estimate
      })
    }
  }

  if (repEfforts.length === 0) return { repEfforts, recoveryLaps: [] }

  // Only count slow laps that fall BETWEEN the first and last hard effort as recovery.
  // Slow laps before the first rep or after the last rep are warmup/cooldown.
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
 * Threshold → 5K conversion.
 * Threshold pace is ~88% vVO2max, 5K pace is ~97% vVO2max.
 * So 5K pace = threshold pace × (88/97) = threshold pace × 0.907
 *
 * HR personalisation: expected threshold HR = 88% × 195 = ~172 bpm.
 * If actual HR < expected, athlete ran easier than true threshold →
 * apply a larger conversion (smaller multiplier → faster 5K estimate).
 */
const DANIELS_RATIO = 0.92  // interval-format threshold → 5K (above standard 0.907 to account for rest)

function danielsRatio(avgHR?: number, maxHr: number = DEFAULT_MAX_HR): number {
  if (!avgHR || avgHR <= 100) return DANIELS_RATIO
  const expectedThresholdHR = maxHr * 0.88
  const hrDelta = expectedThresholdHR - avgHR  // positive = ran easier than threshold → larger ratio → slower 5K
  return Math.max(0.91, Math.min(0.97, DANIELS_RATIO - hrDelta * 0.001))
}

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
  const restPerRep = recoveryLaps.length > 0 ? totalRestSecs / numReps : 0
  const workRestRatio = totalRestSecs > 0 ? totalWorkSecs / totalRestSecs : 99

  // Use activity-level HR for Daniels ratio (best proxy for overall effort)
  const ratio = danielsRatio(activity.average_heartrate, maxHr)

  let totalWeight = 0
  let weightedPaceSum = 0

  for (const rep of repEfforts) {
    // Step 1: threshold pace → 5K pace via Daniels ratio
    // Use per-rep HR if available, fall back to activity-level HR
    const repRatio = danielsRatio(rep.avgHR ?? activity.average_heartrate, maxHr)
    const fiveKPace = rep.paceSecPerKm * repRatio
    // Step 2: apply rest+duration correction (same as intervals)
    const correction = repCorrectionFactor(restPerRep, rep.durationSecs, rep.avgHR, maxHr)
    const correctedPace = fiveKPace * correction
    rep.correctedPaceSec = correctedPace
    rep.correctedSecs = correctedPace * 5
    rep.correctionFactor = parseFloat((repRatio * correction).toFixed(3))
    weightedPaceSum += correctedPace * rep.weight
    totalWeight += rep.weight
  }

  const estimatedPaceSec = weightedPaceSum / totalWeight
  const estimatedSecs = Math.max(840, Math.min(3000, estimatedPaceSec * 5))
  const avgCorrection = repEfforts.reduce((s, e) => s + e.correctionFactor, 0) / repEfforts.length

  return {
    date: activity.start_date.split('T')[0],
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
  }
}

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
  const restPerRep = recoveryLaps.length > 0 ? totalRestSecs / numReps : 0
  const workRestRatio = totalRestSecs > 0 ? totalWorkSecs / totalRestSecs : 99

  let totalWeight = 0
  let weightedPaceSum = 0

  for (let i = 0; i < numReps; i++) {
    const rep = repEfforts[i]
    const correction = repCorrectionFactor(restPerRep, rep.durationSecs, rep.avgHR, maxHr)
    const correctedPace = rep.paceSecPerKm * correction * 0.93
    const corrected5K = correctedPace * 5
    rep.correctedPaceSec = correctedPace
    rep.correctedSecs = corrected5K
    rep.correctionFactor = correction
    // Later reps weighted more heavily (fatigue effect means they better reflect race fitness)
    // Exponential ramp: first rep = 1.0×, last rep = 3.0× base weight
    const positionMultiplier = numReps > 1 ? 1 + (i / (numReps - 1)) : 1
    const w = rep.weight * positionMultiplier
    weightedPaceSum += correctedPace * w
    totalWeight += w
  }

  // Scale down: correction model slightly over-penalises in absolute terms.
  // 0.93 brings estimates to the right level while preserving the short/long rep gap.
  const estimatedPaceSec = weightedPaceSum / totalWeight
  const estimatedSecs = Math.max(840, Math.min(3000, estimatedPaceSec * 5))

  const avgCorrection = repEfforts.reduce((s, e) => s + e.correctionFactor, 0) / repEfforts.length

  return {
    date: activity.start_date.split('T')[0],
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
  }
}

// ─── Interval session analysis ────────────────────────────────────────────────

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

// ─── Threshold session analysis ───────────────────────────────────────────────

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

  const ratio = danielsRatio(activity.average_heartrate, effectiveMaxHr)
  const fiveKPaceSec = paceSec * ratio
  const estimatedSecs = Math.max(840, Math.min(3000, fiveKPaceSec * 5))

  return {
    date: activity.start_date.split('T')[0],
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
  }
}

// ─── Easy run aerobic efficiency analysis ─────────────────────────────────────

/**
 * Aerobic efficiency: pace normalised to a reference HR (150 bpm).
 *
 * Instead of extrapolating to race HR (unreliable over a 40+ bpm gap),
 * we ask: "what pace would this athlete have run at HR 150?"
 *
 * normalised_pace = avg_pace + SLOPE × (avg_HR - REF_HR)
 *
 * SLOPE = -2.0 sec/km per bpm (fixed — from aerobic physiology literature)
 * REF_HR = 150 bpm (comfortably within easy zone, valid for everyone)
 *
 * Downward trend over time = getting faster at the same effort = more aerobically fit.
 * This is directly comparable across runs regardless of heat, fatigue, or route.
 */

const REF_HR = 150
const AEROBIC_SLOPE = -3.0  // sec/km per bpm — steeper to properly reward low-HR runs

export interface EasyRunEfficiency {
  date: string
  activityId: number
  activityName: string
  excludedReason?: string  // set when run was filtered out — display instead of generic message
  runType: string
  normalizedPaceSec: number  // pace at REF_HR (sec/km) — lower = fitter
  avgHR: number
  avgPaceSecPerKm: number
  slope: number              // AEROBIC_SLOPE or regression slope if available
  r2: number                 // 0 if fixed slope used
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
  })

  if (!activity.average_heartrate || !activity.average_speed) return stub('No HR or pace data recorded')
  if (activity.run_type === 'treadmill' || activity.raw?.trainer) return stub('Treadmill run — no GPS pace data')

  const wholeRunAvgHR   = activity.average_heartrate
  const wholeRunAvgPace = 1000 / activity.average_speed

  // Reject non-easy runs using whole-run averages
  if (wholeRunAvgPace < 280) return stub('Pace too fast to be an easy run (< 4:40/km) — tag as interval or threshold instead')
  if (wholeRunAvgHR > 178) return stub('Avg HR above threshold zone — tag as threshold or interval instead')
  if (activity.moving_time < 900) return stub('Run too short (< 15 min)')

  // ── Lap-first window logic ──────────────────────────────────────────────────
  // Walk laps backwards to find the last lap that is >= 15 min (steady block).
  // Then take the last 15 min of that lap using km splits.
  //
  // Rules:
  //   1 lap  → use it if >= 15 min, else exclude
  //   2 laps → use last lap if >= 15 min, else exclude
  //   3+ laps → walk backwards, skip short laps, use first one >= 15 min

  const TARGET_WINDOW = 15 * 60  // 15 minutes in seconds
  const laps: any[] = activity.laps ?? []

  // Find target lap
  let targetLap: any = null
  for (let i = laps.length - 1; i >= 0; i--) {
    const lapTime = laps[i].moving_time ?? laps[i].elapsed_time ?? 0
    if (lapTime >= TARGET_WINDOW) {
      targetLap = laps[i]
      break
    }
  }

  if (!targetLap) return stub('No steady lap ≥ 15 min found — run may be all strides/short laps')

  // Compute target lap's start time in the run (cumulative elapsed of all prior laps)
  let lapStartSec = 0
  for (const lap of laps) {
    if (lap === targetLap) break
    lapStartSec += lap.elapsed_time ?? lap.moving_time ?? 0
  }
  const lapDurSec = targetLap.moving_time ?? targetLap.elapsed_time ?? 0
  const lapEndSec = lapStartSec + lapDurSec

  // Map km splits (activity.splits) to cumulative run time, then filter to target lap
  const kmSplits: any[] = activity.splits ?? []
  let cumSec = 0
  const timedKmSplits = kmSplits.map((sp: any) => {
    const dur = sp.elapsed_time ?? sp.moving_time ?? 60
    const item = { sp, tStart: cumSec, tEnd: cumSec + dur }
    cumSec += dur
    return item
  })

  // Keep km splits that overlap with target lap (with 30s tolerance for GPS drift)
  const lapKmSplits = timedKmSplits
    .filter(ts => ts.tStart >= lapStartSec - 30 && ts.tEnd <= lapEndSec + 30)
    .filter(ts => ts.sp.average_heartrate && ts.sp.average_speed)
    .map(ts => ({
      paceSecPerKm: 1000 / ts.sp.average_speed,
      hr: ts.sp.average_heartrate,
      duration: ts.sp.elapsed_time ?? ts.sp.moving_time ?? 60,
    }))

  // Fallback: if km split mapping failed (e.g. no splits data), use lap avg directly
  let avgHR   = wholeRunAvgHR
  let avgPace = wholeRunAvgPace
  let windowHR = wholeRunAvgHR
  let windowPace = wholeRunAvgPace
  let windowSecs = 0
  let windowSplitsCount = 0
  // validSplits still used for regression below — use all km splits as before
  const validSplits = kmSplits
    .filter((sp: any) => sp.average_heartrate && sp.average_speed)
    .map((sp: any, i: number) => ({
      km: i + 1,
      paceSecPerKm: 1000 / sp.average_speed,
      hr: sp.average_heartrate,
      duration: sp.elapsed_time ?? sp.moving_time ?? 60,
    }))

  if (lapKmSplits.length >= 1) {
    // Take last 15 min of the target lap's km splits
    const windowSplits: typeof lapKmSplits = []
    let wSecs = 0
    for (let i = lapKmSplits.length - 1; i >= 0 && wSecs < TARGET_WINDOW; i--) {
      windowSplits.unshift(lapKmSplits[i])
      wSecs += lapKmSplits[i].duration
    }
    const useSplits = windowSplits.length >= 1 ? windowSplits : lapKmSplits
    const totalDur = useSplits.reduce((s, sp) => s + sp.duration, 0)
    if (totalDur > 0) {
      avgHR   = useSplits.reduce((s, sp) => s + sp.hr   * sp.duration, 0) / totalDur
      avgPace = useSplits.reduce((s, sp) => s + sp.paceSecPerKm * sp.duration, 0) / totalDur
      windowHR = avgHR
      windowPace = avgPace
      windowSecs = totalDur
      windowSplitsCount = useSplits.length
    }
  } else {
    // No km splits mapped — fall back to target lap's own averages
    if (targetLap.average_heartrate && targetLap.average_speed) {
      avgHR   = targetLap.average_heartrate
      avgPace = 1000 / targetLap.average_speed
      windowHR = avgHR
      windowPace = avgPace
      windowSecs = lapDurSec
      windowSplitsCount = 0
    }
  }

  // Try regression if enough HR variation exists across splits
  let slope = AEROBIC_SLOPE
  let r2 = 0

  if (validSplits.length >= 4) {
    const hrs = validSplits.map(s => s.hr)
    const hrRange = Math.max(...hrs) - Math.min(...hrs)

    if (hrRange >= 8) {
      const n = validSplits.length
      const xs = hrs
      const ys = validSplits.map(s => s.paceSecPerKm)
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

  // Normalise to REF_HR using avg pace + slope as the anchor point
  const normalizedPaceSec = avgPace + slope * (REF_HR - avgHR)  // slope is negative → low HR → faster normalised pace

  // Sanity: normalised pace should be plausible easy-to-moderate range
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
  }
}

export function analyzeAllEasyRuns(activities: any[]): EasyRunEfficiency[] {
  return activities.map(a => analyzeEasyRun(a)).filter(Boolean) as EasyRunEfficiency[]
}

// Returns ALL results including excluded ones (for display with reasons)
export function analyzeAllEasyRunsWithReasons(activities: any[]): EasyRunEfficiency[] {
  return activities.map(a => analyzeEasyRun(a)).filter(Boolean) as EasyRunEfficiency[]
}
