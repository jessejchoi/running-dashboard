import { type CPFitResult, predictTimeForDistance } from './criticalPace'
import { type AthleteFeatures, type FormStatus } from './features'
import { type DistanceKey } from '../goals'
import { performanceHeatMultiplier, RACE_DISTANCE_METERS } from './performanceEvidence'
import { projectMarathon, type RaceCalibration, type MarathonProjection } from './personalization'

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
  raceAnchors?: ProvenRaceAnchor[]
  calibration?: Partial<Record<DistanceKey, RaceCalibration>>
  useMarathonEndurance?: boolean
}

export interface ProvenRaceAnchor {
  distanceKey: DistanceKey
  observedSecs: number
  conditions?: AmbientHint | null
  terrainMultiplier?: number | null
  activityId?: number
  date?: string
  source?: 'official_result' | 'full_elapsed' | 'measured_distance'
}

export interface DistanceProjection {
  distanceKey: DistanceKey
  distanceM: number
  baseSecs: number          // pure CP prediction, no modifiers
  idealSecs: number         // ideal conditions, current form
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
    calibrationMultiplier?: number
  }
  confidence: 'high' | 'medium' | 'low'
  supportingRace?: ProvenRaceAnchor
  calibration?: RaceCalibration
  marathon?: MarathonProjection
  explanation?: string
}

function heatMultiplier(wbgtC: number | null | undefined, key: DistanceKey): number {
  return performanceHeatMultiplier(wbgtC, RACE_DISTANCE_METERS[key])
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
  if (key === '5k' || key === '10k') return 1
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

function normalizedAnchor(anchor: ProvenRaceAnchor): number {
  const terrain = anchor.terrainMultiplier
  const terrainMult = terrain != null && Number.isFinite(terrain) && terrain >= 0.95 && terrain <= 1.05 ? terrain : 1
  return anchor.observedSecs / heatMultiplier(anchor.conditions?.wbgtApproxC, anchor.distanceKey) / terrainMult
}

export function project(input: ProjectionInput): DistanceProjection[] {
  const { fit, features, currentConditions, raceConditions, raceAnchors = [] } = input
  const out: DistanceProjection[] = []

  for (const { key, m } of DISTANCES) {
    const baseSecs = predictTimeForDistance(fit, m)
    const anchor = raceAnchors.filter(a => a.distanceKey === key).sort((a, b) => normalizedAnchor(a) - normalizedAnchor(b))[0]

    let enduranceMult = endurancePenalty(features.endurance.longestRunKm, key)
    let driftMult = driftMultiplier(features.drift.weatherQualified ? features.drift.penaltyExcessDriftPct ?? null : features.drift.avgExcessDriftPct, key)
    const todayHeatMult = heatMultiplier(currentConditions?.wbgtApproxC, key)
    const todayFormMult = formMultiplier(features.form.status, true)
    const raceHeatMult  = raceConditions ? heatMultiplier(raceConditions.wbgtApproxC, key) : null

    let idealSecs = baseSecs * enduranceMult * driftMult * todayFormMult
    const calibration = input.calibration?.[key]
    const calibrationMult = calibration?.multiplier ?? 1
    let marathon: MarathonProjection | null = null
    if (key === 'fm' && input.useMarathonEndurance) {
      const half = out.find(p => p.distanceKey === 'hm')
      marathon = half && features.marathonTraining ? projectMarathon(half.idealSecs, features.marathonTraining) : null
      if (marathon) {
        if (half?.confidence === 'low') marathon.confidence = 'low'
        idealSecs = marathon.idealSecs
        enduranceMult = idealSecs / (baseSecs * todayFormMult)
        driftMult = 1 // HM capability already includes its supported drift/form.
      } else {
        // No hidden old-model fallback under the new marathon version.
        if (!anchor) continue
        idealSecs = normalizedAnchor(anchor)
        enduranceMult = 1
        driftMult = 1
      }
    }
    idealSecs *= calibrationMult
    let todaySecs   = idealSecs * todayHeatMult
    let raceDaySecs = raceHeatMult != null
      ? idealSecs * raceHeatMult
      : null

    if (anchor) {
      const anchoredIdealSecs = normalizedAnchor(anchor)
      const anchoredTodaySecs = anchoredIdealSecs * todayHeatMult

      idealSecs = Math.min(idealSecs, anchoredIdealSecs)
      todaySecs = Math.min(todaySecs, anchoredTodaySecs)
      if (raceHeatMult != null) {
        raceDaySecs = Math.min(raceDaySecs ?? Infinity, anchoredIdealSecs * raceHeatMult)
      }
    }

    const unsupportedDrift = features.drift.weatherQualified && features.drift.penaltyExcessDriftPct == null
    const bandPct = Math.max(bandPercent(fit, features), marathon?.bandPct ?? 0,
      unsupportedDrift && key === 'hm' ? 0.08 : unsupportedDrift && key === 'fm' ? 0.15 : 0)
    const p50 = todaySecs
    const p80SecsLow  = p50 * (1 - bandPct)
    const p80SecsHigh = p50 * (1 + bandPct)

    const confidence: 'high' | 'medium' | 'low' =
      marathon ? marathon.confidence :
      unsupportedDrift && (key === 'hm' || key === 'fm') ? 'low' :
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
        calibrationMultiplier: calibrationMult,
      },
      confidence,
      ...(calibration ? { calibration } : {}),
      ...(marathon ? { marathon } : {}),
      explanation: [(key === 'hm' || key === 'fm') ? features.drift.reason : undefined, calibration?.reason, marathon?.reason].filter(Boolean).join(' '),
      ...(anchor ? { supportingRace: anchor } : {}),
    })
  }

  return out
}
