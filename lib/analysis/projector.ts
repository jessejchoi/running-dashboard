import { type CPFitResult, predictTimeForDistance } from './criticalPace'
import { type AthleteFeatures, type FormStatus } from './features'
import { type DistanceKey } from '../goals'

/**
 * Race projector. Single physiological model in, race-time bands out.
 *
 * Each distance produces three numbers (ideal, today, raceDay-if-known) and a
 * confidence band sized by fit quality + feature coverage. Modifiers stack
 * multiplicatively; they're returned alongside the result so the UI can show
 * "your HM is 1:38 today, 1:34 in ideal conditions — heat costs you 4 minutes".
 *
 * v1 model: CP curve is the authoritative pace predictor. Features only apply
 * as modifiers — endurance, drift, form, heat. Aerobic-trend is exposed in the
 * AthleteFeatures input but not yet used to cross-anchor the CP curve.
 */

export interface AmbientHint {
  wbgtApproxC?: number | null
  tempC?: number | null
}

export interface ProjectionInput {
  fit: CPFitResult
  features: AthleteFeatures
  currentConditions?: AmbientHint | null
  raceConditions?: AmbientHint | null
}

export interface DistanceProjection {
  distanceKey: DistanceKey
  distanceM: number
  baseSecs: number          // pure CP prediction, no modifiers
  idealSecs: number         // ideal conditions, neutral freshness
  todaySecs: number         // current conditions + current form
  raceDaySecs: number | null
  p50Secs: number           // central estimate (= todaySecs)
  p80SecsLow: number
  p80SecsHigh: number
  modifiers: {
    enduranceMultiplier: number
    driftMultiplier: number
    heatMultiplier: number
    formMultiplier: number
    bandPct: number
  }
  confidence: 'high' | 'medium' | 'low'
}

/** WBGT baseline for ideal racing conditions. */
const STANDARD_WBGT_C = 15

/**
 * How much heat hurts at each distance, relative to the same WBGT excess at HM.
 * 5K is short enough that thermoregulation rarely becomes the limiter; FM is
 * dominated by it.
 */
const HEAT_DISTANCE_FACTOR: Record<DistanceKey, number> = {
  '5k': 0.35,
  '10k': 0.60,
  'hm':  1.00,
  'fm':  1.25,
}

/**
 * Pace cost per °C WBGT above the standard baseline, at HM distance. Calibrated
 * to literature: ~3% cost at 22°C WBGT (= 7°C above 15) for HM → 0.003 × 7 ≈ 2%.
 * Slightly conservative; we can re-fit against real data later.
 */
const HEAT_COST_PER_C = 0.003

function heatMultiplier(wbgtC: number | null | undefined, key: DistanceKey): number {
  if (wbgtC == null) return 1
  const excess = wbgtC - STANDARD_WBGT_C
  if (excess <= 0) return 1
  return 1 + excess * HEAT_COST_PER_C * HEAT_DISTANCE_FACTOR[key]
}

function endurancePenalty(longestRunKm: number, key: DistanceKey): number {
  if (key !== 'hm' && key !== 'fm') return 1
  const thresholdKm = key === 'hm' ? 25 : 35
  const maxPct = key === 'hm' ? 0.08 : 0.15
  if (longestRunKm >= thresholdKm) return 1
  const ratio = Math.min(1, Math.max(0, longestRunKm) / thresholdKm)
  return 1 + maxPct * (1 - ratio)
}

function driftMultiplier(avgExcessPct: number | null, key: DistanceKey): number {
  if (avgExcessPct == null || avgExcessPct <= 0) return 1
  const cap = key === 'fm' ? 0.08 : key === 'hm' ? 0.05 : 0.02
  const perPct = key === 'fm' ? 0.015 : key === 'hm' ? 0.010 : 0.003
  return 1 + Math.min(cap, avgExcessPct * perPct)
}

function formMultiplier(status: FormStatus, applyToday: boolean): number {
  if (!applyToday) return 1
  switch (status) {
    case 'fresh':     return 0.995
    case 'neutral':   return 1.000
    case 'building':  return 1.015
    case 'fatigued':  return 1.030
    case 'detrained': return 1.005
  }
}

function bandPercent(fit: CPFitResult, features: AthleteFeatures): number {
  const goodAerobic = features.aerobic.points.length >= 4
  if (fit.fitQuality === 'high' && goodAerobic) return 0.025
  if (fit.fitQuality === 'high')                return 0.040
  if (fit.fitQuality === 'medium')              return 0.060
  return 0.10
}

const DISTANCES: { key: DistanceKey; m: number }[] = [
  { key: '5k',  m: 5000 },
  { key: '10k', m: 10000 },
  { key: 'hm',  m: 21097.5 },
  { key: 'fm',  m: 42195 },
]

export function project(input: ProjectionInput): DistanceProjection[] {
  const { fit, features, currentConditions, raceConditions } = input
  const out: DistanceProjection[] = []

  for (const { key, m } of DISTANCES) {
    const baseSecs = predictTimeForDistance(fit, m)

    const enduranceMult = endurancePenalty(features.endurance.longestRunKm, key)
    const driftMult     = driftMultiplier(features.drift.avgExcessDriftPct, key)
    const todayHeatMult = heatMultiplier(currentConditions?.wbgtApproxC, key)
    const todayFormMult = formMultiplier(features.form.status, true)
    const raceHeatMult  = raceConditions ? heatMultiplier(raceConditions.wbgtApproxC, key) : null

    const idealSecs   = baseSecs * enduranceMult * driftMult
    const todaySecs   = baseSecs * enduranceMult * driftMult * todayHeatMult * todayFormMult
    const raceDaySecs = raceHeatMult != null
      ? baseSecs * enduranceMult * driftMult * raceHeatMult
      : null

    const bandPct = bandPercent(fit, features)
    const p50 = todaySecs
    const p80SecsLow  = p50 * (1 - bandPct)
    const p80SecsHigh = p50 * (1 + bandPct)

    const confidence: 'high' | 'medium' | 'low' =
      fit.fitQuality === 'high' && features.aerobic.points.length >= 4 ? 'high' :
      fit.fitQuality !== 'low' ? 'medium' : 'low'

    out.push({
      distanceKey: key,
      distanceM: m,
      baseSecs,
      idealSecs,
      todaySecs,
      raceDaySecs,
      p50Secs: p50,
      p80SecsLow,
      p80SecsHigh,
      modifiers: {
        enduranceMultiplier: enduranceMult,
        driftMultiplier:     driftMult,
        heatMultiplier:      todayHeatMult,
        formMultiplier:      todayFormMult,
        bandPct,
      },
      confidence,
    })
  }

  return out
}
