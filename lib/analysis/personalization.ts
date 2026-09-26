import type { DistanceKey } from '@/lib/goals'
import { RACE_DISTANCE_METERS, performanceHeatMultiplier, performanceCutoff } from './performanceEvidence'
import { localDate, weekStart, addDays, runDay } from '@/lib/calendar'

// Independent rollouts. Race calibration was explicitly enabled by the owner
// after the September 13 preview; its statistical validation remains incomplete.
// An explicit false rolls it back. Marathon endurance stays opt-in.
export function raceCalibrationEnabled() { return (process.env.RACE_CALIBRATION_ENABLED ?? 'true') === 'true' }
export function marathonEnduranceEnabled() { return process.env.MARATHON_ENDURANCE_ENABLED === 'true' }
export function personalizationVersion() {
  return `${raceCalibrationEnabled() ? '-race1' : ''}${marathonEnduranceEnabled() ? '-marathon1' : ''}`
}
export interface CalibrationObservation {
  activityId: number
  date: string
  distanceKey: DistanceKey
  actualIdealSecs: number
  predictedIdealSecs: number
  effort: 'maximal' | 'submaximal' | 'unknown'
  source: 'official_result' | 'full_elapsed'
}
export interface RaceCalibration {
  multiplier: number
  sampleSize: number
  effectiveWeight: number
  evidence: CalibrationObservation[]
  reason: string
}
export const neutralCalibration = (): RaceCalibration => ({ multiplier: 1, sampleSize: 0, effectiveWeight: 0, evidence: [], reason: 'No qualifying pre-race prediction/result pairs.' })

/** Learn bounded, shrunk, distance-specific residuals. Never train on the race
 * being predicted. Unknown/submaximal effort proves a faster capability only;
 * it cannot establish a slower maximum. No user's target time enters this fit. */
export function calibrateRaceResults(observations: CalibrationObservation[], key: DistanceKey, asOf: Date): RaceCalibration {
  const unique = new Map<number, CalibrationObservation>()
  for (const row of observations) {
    const age = (asOf.getTime() - Date.parse(row.date)) / 86400000
    if (row.distanceKey !== key || !Number.isFinite(age) || age <= 0 || Date.parse(row.date) < Date.parse(performanceCutoff(asOf)) ||
      !Number.isFinite(row.actualIdealSecs) || !Number.isFinite(row.predictedIdealSecs) ||
      row.actualIdealSecs <= 0 || row.predictedIdealSecs <= 0) continue
    if (row.effort !== 'maximal' && row.actualIdealSecs >= row.predictedIdealSecs) continue
    unique.set(row.activityId, row)
  }
  const evidence = Array.from(unique.values())
  if (!evidence.length) return neutralCalibration()
  const weighted = evidence.map(row => ({ row,
    residual: Math.max(-0.10, Math.min(0.10, Math.log(row.actualIdealSecs / row.predictedIdealSecs))),
    weight: Math.pow(0.5, (asOf.getTime() - Date.parse(row.date)) / 86400000 / 90) * (row.source === 'official_result' ? 1 : 0.5),
  })).sort((a, b) => a.residual - b.residual)
  const total = weighted.reduce((s, r) => s + r.weight, 0)
  let cumulative = 0, median = 0
  for (const r of weighted) { cumulative += r.weight; if (cumulative >= total / 2) { median = r.residual; break } }
  // Four neutral pseudo-observations keep one uncertain race from resetting fitness.
  const multiplier = Math.exp(median * total / (total + 4))
  return { multiplier, sampleSize: evidence.length, effectiveWeight: total, evidence,
    reason: `Personal ${key.toUpperCase()} correction from ${evidence.length} race(s), using only earlier training; sparse evidence is shrunk toward no correction.` }
}

export interface TrainingEvidenceRun {
  id: number; start_date: string; start_date_local?: string | null; distance: number; moving_time: number
  excluded_from_analysis?: boolean | null
}
export interface MarathonTraining {
  weeks: number
  coveredWeeks: number
  weeklyKm: number[]
  averageWeeklyKm: number
  consistentWeeks: number
  runsOver90Mins: number
  runsOver120Mins: number
  runsOver25Km: number
  runsOver30Km: number
  supportingActivityIds: number[]
  latePaceFadePct?: number | null
  latePaceSampleSize?: number
}
/** Twelve complete local weeks, including zero-run weeks; separate runs remain
 * separate long-run evidence even when two runs happen on the same day. */
export function marathonTraining(runs: TrainingEvidenceRun[], asOf: Date, timezone = 'Asia/Jakarta', paceEvidence?: { longRunPaceFadePct?: number | null; longRunPaceSampleSize?: number }): MarathonTraining {
  const end = weekStart(localDate(asOf, timezone)), start = addDays(end, -84)
  const weeks = Array.from({ length: 12 }, (_, i) => addDays(start, i * 7))
  const totals = new Map(weeks.map(w => [w, 0]))
  let over90 = 0, over120 = 0, over25 = 0, over30 = 0
  const ids: number[] = [], seen = new Set<number>()
  let earliest = end
  for (const run of runs) {
    if (run.excluded_from_analysis || seen.has(run.id) || !Number.isFinite(run.distance) || !Number.isFinite(run.moving_time) || run.distance <= 0 || run.moving_time <= 0 || !Number.isFinite(Date.parse(run.start_date)) || Date.parse(run.start_date) >= asOf.getTime()) continue
    seen.add(run.id)
    const date = runDay(run, timezone)
    if (date < earliest) earliest = date
    if (date < start || date >= end) continue
    const week = weekStart(date)
    totals.set(week, (totals.get(week) ?? 0) + run.distance / 1000)
    if (run.moving_time >= 5400) { over90++; ids.push(run.id) }
    if (run.moving_time >= 7200) over120++
    if (run.distance >= 25000) over25++
    if (run.distance >= 30000) over30++
  }
  const weeklyKm = weeks.map(w => totals.get(w) ?? 0)
  return { weeks: 12, coveredWeeks: weeks.filter(w => w >= weekStart(earliest)).length, weeklyKm,
    averageWeeklyKm: weeklyKm.reduce((a, b) => a + b, 0) / 12,
    consistentWeeks: weeklyKm.filter(km => km >= 30).length,
    runsOver90Mins: over90, runsOver120Mins: over120, runsOver25Km: over25, runsOver30Km: over30,
    supportingActivityIds: ids, latePaceFadePct: paceEvidence?.longRunPaceFadePct ?? null, latePaceSampleSize: paceEvidence?.longRunPaceSampleSize ?? 0 }
}
export interface MarathonProjection {
  idealSecs: number
  exponent: number
  bandPct: number
  confidence: 'low' | 'medium'
  training: MarathonTraining
  reason: string
}
/** Candidate endurance curve: half-marathon performance plus additional fatigue
 * over the second half. Coefficients are explicit hypotheses, NOT coefficients
 * from the Vickers paper. Gate separately until held-out marathon validation. */
export function projectMarathon(halfIdealSecs: number, training: MarathonTraining): MarathonProjection | null {
  if (!(halfIdealSecs > 0) || !Number.isFinite(halfIdealSecs) || training.coveredWeeks < 6) return null
  const deficit = (value: number, sufficient: number) => 1 - Math.max(0, Math.min(1, value / sufficient))
  const exponent = 1.10 + 0.08 * deficit(training.averageWeeklyKm, 70)
    + 0.04 * deficit(training.consistentWeeks, 10)
    + 0.04 * deficit(training.runsOver90Mins, 10)
    + 0.04 * deficit(training.runsOver120Mins, 6)
    + 0.04 * deficit(training.runsOver25Km, 4)
    + 0.02 * deficit(training.runsOver30Km, 2)
    + ((training.latePaceSampleSize ?? 0) >= 3 && training.latePaceFadePct != null
      ? 0.03 * Math.max(0, Math.min(1, training.latePaceFadePct / 10)) : 0)
  const wellSupported = training.coveredWeeks === 12 && training.consistentWeeks >= 10 && training.runsOver25Km >= 3 && training.runsOver120Mins >= 4
    && (training.latePaceSampleSize ?? 0) >= 3 && training.latePaceFadePct != null && training.latePaceFadePct <= 3
  return { idealSecs: halfIdealSecs * Math.pow(2, exponent), exponent,
    bandPct: wellSupported ? 0.10 : 0.18, confidence: wellSupported ? 'medium' : 'low', training,
    reason: `Marathon extrapolation from half-marathon capability and 12 complete training weeks: ${training.averageWeeklyKm.toFixed(0)} km/week, ${training.runsOver120Mins} runs of 2+ hours, ${training.runsOver25Km} runs of 25+ km. ${training.latePaceFadePct == null ? 'Comparable late-run pace evidence is missing.' : `Cool, steady long-run pace fade: ${training.latePaceFadePct.toFixed(1)}%.`} Endurance and drift penalties are not stacked again.` }
}
export function normalizedRaceSeconds(seconds: number, wbgt: number | null | undefined, key: DistanceKey, terrain = 1) {
  return seconds / performanceHeatMultiplier(wbgt, RACE_DISTANCE_METERS[key]) / (Number.isFinite(terrain) && terrain >= 0.95 && terrain <= 1.05 ? terrain : 1)
}
