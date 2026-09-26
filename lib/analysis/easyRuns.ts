import { type DistanceKey, type EasyRunEfficiency, type LongRunAnalysis, type RaceEstimate } from './types'
import { formatPace } from './formatting'
import { DISTANCE_KM } from './riegel'
import { AEROBIC_SLOPE, DEFAULT_MAX_HR, REF_HR, computeCardiacDrift, driftPenaltyMultiplier, durationEfficiencyCredit } from './physiology'
import { buildTimedSplits, extractSteadyWindow } from './steadyWindows'
import { runDay } from '@/lib/calendar'
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
    date: runDay(activity),
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

  // Cardiac drift on the full-run km splits (wider temporal spread than steady window).
  // Use 8-min windows + 8-min gap so runs ≥35 min can produce reliable drift.
  // Fall back to laps when splits aren't loaded (splits omitted from ACTIVITY_COLS for perf).
  const easyTimed = buildTimedSplits((activity.splits?.length ? activity.splits : null) ?? activity.laps ?? [])
  const easyDrift = computeCardiacDrift(easyTimed, activity.moving_time, {
    minDurationSecs: 20 * 60,
    windowSecs:       8 * 60,
    minGapSecs:        8 * 60,
  })

  return {
    date: runDay(activity),
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
    driftRawPct:       easyDrift.reliable ? parseFloat(easyDrift.drift.toFixed(1)) : undefined,
    driftExcessPct:    easyDrift.reliable ? parseFloat(easyDrift.excessDrift.toFixed(1)) : undefined,
    driftReliable:     easyDrift.reliable,
    driftEarlyWindow:  easyDrift.earlyWindow,
    driftLateWindow:   easyDrift.lateWindow,
  } as any
}

export function analyzeAllEasyRuns(activities: any[]): EasyRunEfficiency[] {
  return activities.map(a => analyzeEasyRun(a)).filter(Boolean) as EasyRunEfficiency[]
}

export function analyzeAllEasyRunsWithReasons(activities: any[]): EasyRunEfficiency[] {
  return activities.map(a => analyzeEasyRun(a)).filter(Boolean) as EasyRunEfficiency[]
}
// ─── Per-run aerobic efficiency race estimates ────────────────────────────────

/**
 * Generate per-run race estimates from a single EasyRunEfficiency data point.
 * Uses that run's own normalizedPaceSec and slope to project to race HRs.
 * Applies per-run excess drift penalty (heavier for longer distances).
 * These per-run estimates feed aggregateSource('easy_trend') directly.
 */
export function easyRunToRaceEstimates(run: EasyRunEfficiency, maxHr: number): RaceEstimate[] {
  if (run.excludedReason || !run.normalizedPaceSec || run.normalizedPaceSec <= 0) return []

  const raceHRs: Record<DistanceKey, number> = {
    '5k': maxHr * 0.96,
    '10k': maxHr * 0.92,
    'hm': maxHr * 0.87,
    'fm': maxHr * 0.82,
  }

  const estimates: RaceEstimate[] = []
  for (const dk of ['5k', '10k', 'hm', 'fm'] as DistanceKey[]) {
    const raceHR   = raceHRs[dk]
    const hrGap    = raceHR - REF_HR
    const ampFactor = 1 + 0.005 * hrGap
    const racePace  = run.normalizedPaceSec + run.slope * hrGap * ampFactor
    if (racePace < 150 || racePace > 450) continue

    const hrGapPenalty = Math.max(0.3, 1 - (hrGap - 15) * 0.02)
    const driftMult    = run.driftReliable && run.driftExcessPct != null
      ? driftPenaltyMultiplier(run.driftExcessPct, dk)
      : 1
    const driftNote = run.driftReliable && (run.driftExcessPct ?? 0) > 0
      ? ` (drift +${run.driftExcessPct!.toFixed(1)}% excess)`
      : ''

    estimates.push({
      distanceKey: dk,
      estimatedSecs: racePace * DISTANCE_KM[dk] * driftMult,
      confidence: 0.40 * hrGapPenalty,
      source: 'easy_trend',
      date: run.date,
      activityId: run.activityId,
      method: `${formatPace(run.normalizedPaceSec)}/km @ 150bpm → ${dk.toUpperCase()} projection${driftNote}`,
    })
  }
  return estimates
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

  // Recency-weighted average excess drift across recent runs with reliable drift data
  const driftRuns = recent.filter(r => r.driftReliable && r.driftExcessPct != null)
  let avgExcessDrift = 0
  if (driftRuns.length >= 2) {
    let driftWeightSum = 0
    let driftWeightedVal = 0
    for (const r of driftRuns) {
      const ageDays = (now - new Date(r.date).getTime()) / 86400000
      const w = Math.exp(-ageDays * Math.LN2 / 21)
      driftWeightedVal += r.driftExcessPct! * w
      driftWeightSum   += w
    }
    avgExcessDrift = driftWeightSum > 0 ? driftWeightedVal / driftWeightSum : 0
  }

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
    // Drift confidence penalty: persistent excess drift reduces reliability of HM/FM projections
    const driftConfPenalty = driftRuns.length >= 2
      ? Math.min(0.10, Math.max(0, avgExcessDrift) * 0.02)
      : 0
    const baseConfidence = 0.40

    // Apply drift pace penalty (heavier for longer race distances)
    const driftMult = driftRuns.length >= 2 ? driftPenaltyMultiplier(avgExcessDrift, dk) : 1
    const driftNote = driftRuns.length >= 2 && avgExcessDrift > 0
      ? ` (avg excess drift +${avgExcessDrift.toFixed(1)}%)`
      : ''

    const km = DISTANCE_KM[dk]
    estimates.push({
      distanceKey: dk,
      estimatedSecs: racePace * km * driftMult,
      confidence: (baseConfidence - driftConfPenalty) * hrGapPenalty,
      source: 'easy_trend',
      date: latestRun.date,
      activityId: latestRun.activityId,
      method: `Easy run trend: ${formatPace(avgNormalizedPace)}/km @ 150bpm → race HR projection${driftNote}`,
    })
  }

  return estimates
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
      // Use total run duration (not just steady portion) so long runs get full credit
      const totalDurationMins = lr.distanceKm * lr.overallPace / 60
      const normalizedPaceSec = normalizedPaceRaw - durationEfficiencyCredit(totalDurationMins)
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
