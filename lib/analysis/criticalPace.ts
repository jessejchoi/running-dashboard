import { AEROBIC_SLOPE, DEFAULT_MAX_HR } from './physiology'

/**
 * 3-parameter critical-pace model (Morton 1996, adapted for running).
 *
 *   v(t) = CV + D' / (t + D'/(Vmax - CV))
 *
 *   CV   — critical velocity (m/s): sustainable aerobic asymptote
 *   D'   — anaerobic distance reserve (m): work above CV
 *   Vmax — neuromuscular ceiling (m/s): instantaneous max speed
 *
 * The model is monotone decreasing in t, smooth, asymptotic to CV. At t=0 it
 * reduces to Vmax; at large t it approaches CV. Fitting it to a runner's
 * best-efforts curve gives a single physiological model that predicts pace at
 * any duration without separate per-source weighting.
 *
 * This module is pure. Orchestration (DB queries, recency windowing) lives in
 * the service / projector layer.
 */

export interface BestEffortPoint {
  durationSecs: number
  paceSecPerKm: number
  date: string         // YYYY-MM-DD
  activityId: number
  weight?: number
  avgHR?: number | null
  observedPaceSecPerKm?: number
  adjustedPaceSecPerKm?: number
  adjustmentReason?: string
}

export interface CPFitResult {
  cv: number                          // critical velocity (m/s)
  dPrime: number                      // anaerobic distance reserve (m)
  vmax: number                        // neuromuscular ceiling (m/s)
  rmse: number                        // RMSE of fit, in m/s
  nPoints: number                     // distinct durations used
  durationRangeSecs: [number, number] // [min, max] of fit data
  fitQuality: 'high' | 'medium' | 'low'
}

/** Pace (sec/km) predicted by the model at a given duration. */
export function predictPaceAt(fit: CPFitResult, durationSecs: number): number {
  const k = fit.dPrime / (fit.vmax - fit.cv)
  const v = fit.cv + fit.dPrime / (durationSecs + k)
  return 1000 / v
}

/**
 * Time (seconds) to cover `distanceM` at the model's predicted effort.
 *
 * Derived by solving D = v(t) × t for t. With k = D'/(Vmax - CV), the
 * resulting quadratic is:
 *
 *   CV·t² + (CV·k + D' − D)·t − D·k = 0
 *
 * Positive root is the answer.
 */
export function predictTimeForDistance(fit: CPFitResult, distanceM: number): number {
  const k = fit.dPrime / (fit.vmax - fit.cv)
  const a = fit.cv
  const b = fit.cv * k + fit.dPrime - distanceM
  const c = -distanceM * k
  const disc = b * b - 4 * a * c
  if (disc < 0) return Infinity
  return (-b + Math.sqrt(disc)) / (2 * a)
}

function linspace(min: number, max: number, n: number): number[] {
  const out: number[] = new Array(n)
  const step = (max - min) / (n - 1)
  for (let i = 0; i < n; i++) out[i] = min + i * step
  return out
}

/**
 * Best-effort rows are an observed upper envelope, not proof that the athlete
 * could not have gone faster for that duration. Missing race-like long efforts
 * should not drag CP down as hard as actual faster efforts constrain it.
 */
const SUBMAXIMAL_EFFORT_PENALTY = 1
const CAPABILITY_MISS_PENALTY = 1_000_000
const RIEGEL_EXPONENT = 1.06

export function targetRaceHRForDuration(
  durationSecs: number,
  maxHr: number = DEFAULT_MAX_HR,
): number | null {
  if (durationSecs < 180) return null
  if (durationSecs <= 600) return maxHr * 0.96
  if (durationSecs <= 1200) return maxHr * 0.94
  if (durationSecs <= 1800) return maxHr * 0.92
  if (durationSecs <= 2700) return maxHr * 0.90
  if (durationSecs <= 3600) return maxHr * 0.88
  return maxHr * 0.86
}

function maxHrImprovementFraction(durationSecs: number): number {
  if (durationSecs < 180) return 0
  if (durationSecs <= 600) return 0.20
  if (durationSecs <= 2700) return 0.25
  return 0.30
}

export function adjustBestEffortToRaceHR(
  point: BestEffortPoint,
  maxHr: number = DEFAULT_MAX_HR,
): BestEffortPoint {
  const observedPace = point.observedPaceSecPerKm ?? point.paceSecPerKm
  const base: BestEffortPoint = {
    ...point,
    paceSecPerKm: observedPace,
    observedPaceSecPerKm: observedPace,
    adjustedPaceSecPerKm: observedPace,
  }

  const targetHR = targetRaceHRForDuration(point.durationSecs, maxHr)
  if (targetHR == null || point.avgHR == null || point.avgHR <= 0) return base

  const hrGap = targetHR - point.avgHR
  if (hrGap <= 0) return base

  const projectedPace = observedPace + AEROBIC_SLOPE * hrGap
  const capPace = observedPace * (1 - maxHrImprovementFraction(point.durationSecs))
  const adjustedPace = Math.min(observedPace, Math.max(projectedPace, capPace))

  if (adjustedPace >= observedPace) return base
  return {
    ...base,
    paceSecPerKm: adjustedPace,
    adjustedPaceSecPerKm: adjustedPace,
    adjustmentReason: `HR ${point.avgHR.toFixed(0)}→${targetHR.toFixed(0)} bpm`,
  }
}

function projectPaceToDuration(sourcePace: number, sourceSecs: number, targetSecs: number): number {
  const ratio = targetSecs / sourceSecs
  return sourcePace * Math.pow(ratio, 1 - 1 / RIEGEL_EXPONENT)
}

function transferForDurationGap(sourceSecs: number, targetSecs: number): number {
  const gap = Math.log(targetSecs / sourceSecs)
  const freeGap = Math.log(1.5)
  return Math.exp(-Math.max(0, gap - freeGap))
}

export function buildCapabilityEnvelope(points: BestEffortPoint[]): BestEffortPoint[] {
  const bestByDuration = new Map<number, BestEffortPoint>()
  for (const point of points) {
    const observedPace = point.observedPaceSecPerKm ?? point.paceSecPerKm
    const adjustedPace = point.adjustedPaceSecPerKm ?? point.paceSecPerKm
    const normalized: BestEffortPoint = {
      ...point,
      paceSecPerKm: adjustedPace,
      observedPaceSecPerKm: observedPace,
      adjustedPaceSecPerKm: adjustedPace,
    }
    const cur = bestByDuration.get(point.durationSecs)
    if (!cur || normalized.paceSecPerKm < cur.paceSecPerKm) {
      bestByDuration.set(point.durationSecs, normalized)
    }
  }

  const envelope = Array.from(bestByDuration.values())
    .sort((a, b) => a.durationSecs - b.durationSecs)
  const sources = envelope.map(point => ({ ...point }))

  for (const source of sources) {
    if (source.durationSecs < 180) continue
    for (let i = 0; i < envelope.length; i++) {
      const target = envelope[i]
      if (target.durationSecs <= source.durationSecs) continue
      if (target.activityId === source.activityId) continue

      const projectedPace = projectPaceToDuration(
        source.paceSecPerKm,
        source.durationSecs,
        target.durationSecs,
      )
      if (projectedPace >= target.paceSecPerKm) continue

      const transfer = transferForDurationGap(source.durationSecs, target.durationSecs)
      const improvedPace = target.paceSecPerKm - (target.paceSecPerKm - projectedPace) * transfer
      if (improvedPace < target.paceSecPerKm) {
        envelope[i] = {
          ...target,
          paceSecPerKm: improvedPace,
          adjustedPaceSecPerKm: improvedPace,
          adjustmentReason: `Envelope from ${source.durationSecs}s effort`,
        }
      }
    }
  }

  return envelope
}

/**
 * Fit the 3-param critical-pace model to a set of best efforts.
 *
 * Returns null if input is too sparse. For each distinct duration we keep the
 * single fastest effort across all supplied points (the maximal-mean speed at
 * that duration). The fit then runs a coarse 3D grid search followed by
 * coordinate-descent refinement.
 *
 * Grid resolution is set so even on a hot path the fit runs in <10ms.
 */
export function fitCriticalPace(points: BestEffortPoint[]): CPFitResult | null {
  if (points.length < 3) return null

  const envelope = buildCapabilityEnvelope(points)
  if (envelope.length < 3) return null

  const fitPoints = envelope.filter(p => p.durationSecs >= 180)
  if (fitPoints.length < 3) return null

  const data = fitPoints
    .map(p => ({ t: p.durationSecs, v: 1000 / p.paceSecPerKm, weight: p.weight ?? 1 }))

  const residual = (cv: number, dPrime: number, vmax: number, envelopeLoss = true): number => {
    if (vmax <= cv || cv <= 0 || dPrime <= 0) return Infinity
    const k = dPrime / (vmax - cv)
    let sse = 0
    for (const { t, v, weight } of data) {
      const vHat = cv + dPrime / (t + k)
      const diff = v - vHat
      const asymmetry = !envelopeLoss ? 1
        : diff > 0 ? CAPABILITY_MISS_PENALTY
          : diff < 0 ? SUBMAXIMAL_EFFORT_PENALTY
            : 1
      sse += diff ** 2 * weight * asymmetry
    }
    return sse
  }

  // Plausible ranges for recreational-to-competitive runners.
  // CV  ~ threshold pace: 2.5–5.5 m/s  (≈ 6:40–3:00 /km)
  // D'  ~ anaerobic reserve: 50–400 m
  // Vmax ~ all-out sprint: 5–11 m/s    (≈ 3:20–1:30 /km)
  const cvGrid = linspace(2.5, 5.5, 31)
  const dGrid  = linspace(50,  400, 25)
  const vGrid  = linspace(5.0, 11.0, 25)

  let bestCV = 0, bestD = 0, bestV = 0, bestSSE = Infinity
  for (const cv of cvGrid) {
    for (const d of dGrid) {
      for (const v of vGrid) {
        if (v <= cv + 0.1) continue
        const sse = residual(cv, d, v)
        if (sse < bestSSE) { bestSSE = sse; bestCV = cv; bestD = d; bestV = v }
      }
    }
  }
  if (bestSSE === Infinity) return null

  // Coordinate descent — first a coarse step, then a fine step.
  for (const step of [[0.05, 5, 0.1], [0.005, 0.5, 0.01], [0.0005, 0.05, 0.001]]) {
    const [sCV, sD, sV] = step
    for (let iter = 0; iter < 500; iter++) {
      let improved = false
      const deltas: [number, number, number][] = [
        [+sCV, 0, 0], [-sCV, 0, 0],
        [0, +sD, 0],  [0, -sD, 0],
        [0, 0, +sV],  [0, 0, -sV],
      ]
      for (const [dCV, dD, dV] of deltas) {
        const sse = residual(bestCV + dCV, bestD + dD, bestV + dV)
        if (sse < bestSSE - 1e-12) {
          bestSSE = sse; bestCV += dCV; bestD += dD; bestV += dV; improved = true
        }
      }
      if (!improved) break
    }
  }

  const maxCapabilityShortfall = (cv: number, dPrime: number, vmax: number): number => {
    const k = dPrime / (vmax - cv)
    let maxShortfall = 0
    for (const { t, v } of data) {
      const vHat = cv + dPrime / (t + k)
      maxShortfall = Math.max(maxShortfall, v - vHat)
    }
    return maxShortfall
  }
  const numericalShortfall = maxCapabilityShortfall(bestCV, bestD, bestV)
  if (numericalShortfall > 0 && numericalShortfall <= 0.01) {
    const shift = numericalShortfall * 1.001
    bestCV += shift
    bestV += shift
    bestSSE = residual(bestCV, bestD, bestV)
  }

  const weightSum = data.reduce((sum, point) => sum + point.weight, 0)
  const rmse = Math.sqrt(residual(bestCV, bestD, bestV, false) / Math.max(weightSum, 1))
  const tMin = data[0].t
  const tMax = data[data.length - 1].t

  // Coverage check — quality of the fit depends on whether we have points
  // anchoring short, medium, and long race-relevant regions.
  const hasShort  = data.some(d => d.t >= 180 && d.t <= 600)
  const hasMid    = data.some(d => d.t >= 900 && d.t <= 1800)
  const hasLong   = data.some(d => d.t >= 2700)
  const anchors   = (hasShort ? 1 : 0) + (hasMid ? 1 : 0) + (hasLong ? 1 : 0)

  const fitQuality: 'high' | 'medium' | 'low' =
    (anchors === 3 && data.length >= 6 && rmse < 0.15) ? 'high' :
    (anchors >= 2 && data.length >= 4 && rmse < 0.30) ? 'medium' : 'low'

  return {
    cv: bestCV,
    dPrime: bestD,
    vmax: bestV,
    rmse,
    nPoints: data.length,
    durationRangeSecs: [tMin, tMax],
    fitQuality,
  }
}
