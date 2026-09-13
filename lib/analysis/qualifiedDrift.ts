import { extractDrift, type DriftFeature, type RunRow } from './features'
import { computeCardiacDrift } from './physiology'
import { buildTimedSplits } from './steadyWindows'
import { isTreadmillRun } from '@/lib/run-classification'

export interface QualifiedDrift extends DriftFeature {
  weatherQualified: true
  penaltyExcessDriftPct: number | null
  qualifiedSampleSize: number
  evidenceActivityIds: number[]
  excluded: { heat: number; missingWeather: number; terrainOrPacing: number; effort: number }
  reason: string
}
/** A run-average weather estimate cannot identify how much drift heat caused.
 * Use only low-heat, easy, steady, relatively flat outdoor evidence instead of
 * subtracting an invented temperature-to-HR coefficient. Unknown != zero drift. */
export function extractQualifiedDrift(runs: RunRow[], conditions: Map<number, number | null>): QualifiedDrift {
  const raw = extractDrift(runs)
  const excluded = { heat: 0, missingWeather: 0, terrainOrPacing: 0, effort: 0 }
  const qualified: { id: number; excess: number }[] = []
  const longPaceFades: number[] = []
  for (const run of runs) {
    if (run.excluded_from_analysis) continue
    if (run.is_race || !['easy', 'long', 'long_run', 'long_easy', 'long_steady', 'recovery'].includes(run.run_type ?? '')) { excluded.effort++; continue }
    const wbgt = conditions.get(run.id)
    // Outdoor weather does not establish treadmill-room conditions.
    if (isTreadmillRun(run) || typeof wbgt !== 'number' || !Number.isFinite(wbgt) || wbgt < -10 || wbgt > 40) { excluded.missingWeather++; continue }
    if (wbgt > 18) { excluded.heat++; continue }
    const splits = (run.splits ?? []).filter(s => s.distance >= 400 && Number.isFinite(s.average_speed) && s.average_speed > 0)
    const paces = splits.map(s => 1000 / s.average_speed)
    const mean = paces.reduce((a, b) => a + b, 0) / paces.length
    const cv = Math.sqrt(paces.reduce((s, p) => s + (p - mean) ** 2, 0) / paces.length) / mean
    const knownTerrain = typeof run.total_elevation_gain === 'number' && Number.isFinite(run.total_elevation_gain)
      && run.total_elevation_gain >= 0 && run.total_elevation_gain / (run.distance / 1000) <= 8
      && splits.every(s => typeof s.elevation_difference === 'number' && Number.isFinite(s.elevation_difference) && Math.abs(s.elevation_difference / s.distance) <= 0.015)
    if (!knownTerrain || paces.length < 6 || !Number.isFinite(cv) || cv > 0.08 || Math.max(...paces) / Math.min(...paces) > 1.20) { excluded.terrainOrPacing++; continue }
    const drift = computeCardiacDrift(buildTimedSplits(run.splits ?? []), run.moving_time, { minDurationSecs: 35 * 60, windowSecs: 8 * 60, minGapSecs: 8 * 60 })
    if (drift.reliable && Number.isFinite(drift.excessDrift)) {
      qualified.push({ id: run.id, excess: drift.excessDrift })
      if (run.moving_time >= 5400 && drift.earlyWindow && drift.lateWindow && drift.earlyWindow.avgPace > 0) {
        longPaceFades.push(100 * (drift.lateWindow.avgPace / drift.earlyWindow.avgPace - 1))
      }
    }
  }
  const values = qualified.map(q => q.excess).sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  const median = values.length ? (values[mid] + values[Math.floor((values.length - 1) / 2)]) / 2 : null
  longPaceFades.sort((a, b) => a - b)
  const paceMedian = longPaceFades.length >= 3
    ? (longPaceFades[Math.floor(longPaceFades.length / 2)] + longPaceFades[Math.floor((longPaceFades.length - 1) / 2)]) / 2 : null
  return { ...raw, weatherQualified: true, longRunPaceFadePct: paceMedian, longRunPaceSampleSize: longPaceFades.length,
    penaltyExcessDriftPct: values.length >= 3 ? median : null,
    qualifiedSampleSize: values.length, evidenceActivityIds: qualified.map(q => q.id), excluded,
    reason: values.length >= 3 ? `Drift penalty uses ${values.length} cool, steady, flat easy runs.`
      : 'Insufficient comparable cool-weather drift evidence; raw drift is retained for context and increases uncertainty, not the finish-time penalty.' }
}
