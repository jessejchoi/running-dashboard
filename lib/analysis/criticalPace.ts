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

  // Per duration, keep the fastest effort (lowest pace = highest speed).
  const bestByDuration = new Map<number, BestEffortPoint>()
  for (const p of points) {
    const cur = bestByDuration.get(p.durationSecs)
    if (!cur || p.paceSecPerKm < cur.paceSecPerKm) bestByDuration.set(p.durationSecs, p)
  }
  if (bestByDuration.size < 3) return null

  const data = Array.from(bestByDuration.values())
    .sort((a, b) => a.durationSecs - b.durationSecs)
    .map(p => ({ t: p.durationSecs, v: 1000 / p.paceSecPerKm }))

  const residual = (cv: number, dPrime: number, vmax: number): number => {
    if (vmax <= cv || cv <= 0 || dPrime <= 0) return Infinity
    const k = dPrime / (vmax - cv)
    let sse = 0
    for (const { t, v } of data) {
      const vHat = cv + dPrime / (t + k)
      sse += (v - vHat) ** 2
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
  for (const step of [[0.05, 5, 0.1], [0.005, 0.5, 0.01]]) {
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

  const rmse = Math.sqrt(bestSSE / data.length)
  const tMin = data[0].t
  const tMax = data[data.length - 1].t

  // Coverage check — quality of the fit depends on whether we have points
  // anchoring each region (Vmax / D' / CV).
  const hasShort  = data.some(d => d.t <= 120)
  const hasMid    = data.some(d => d.t >= 180 && d.t <= 900)
  const hasLong   = data.some(d => d.t >= 1200)
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
