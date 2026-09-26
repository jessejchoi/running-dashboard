import { fitPerformanceCorpus, canonicalRaceDistanceKey, type PerformanceCorpus } from './cpCorpus'
import { extractAerobic, extractEndurance, extractForm } from './features'
import { extractQualifiedDrift } from './qualifiedDrift'
import { project } from './projector'
import { calibrateRaceResults, normalizedRaceSeconds, marathonTraining, type CalibrationObservation } from './personalization'
import { performanceCutoff, RACE_DISTANCE_METERS } from './performanceEvidence'
import type { DistanceKey } from '@/lib/goals'
import { runDay, latestRunTimezone } from '@/lib/calendar'

/** Full elapsed/official race results only; GPS best segments remain constraints,
 * never equality labels for calibration. Unknown effort cannot teach a slower max. */
export function raceOutcome(run: any, conditions: Map<number, any>) {
  if (run.excluded_from_analysis || !(run.official_result_secs || run.is_race || run.run_type === 'race' || run.raw?.workout_type === 1)) return null
  const key = canonicalRaceDistanceKey(run.distance / 1000)
  if (!key) return null
  const official = run.official_result_secs > 0 ? run.official_result_secs : null
  const seconds = official ?? run.elapsed_time
  if (!Number.isFinite(seconds) || seconds <= 0 || (!official && run.distance < RACE_DISTANCE_METERS[key])) return null
  const wbgt = conditions.get(run.id)?.wbgt_approx_c
  // Avoid learning weather/course error as a personal physiological bias.
  if (typeof wbgt !== 'number' || !Number.isFinite(wbgt) || wbgt < -10 || wbgt > 40) return null
  const splits = run.splits ?? []
  const coverage = splits.reduce((s: number, p: any) => s + (p.distance ?? 0), 0)
  const knownGain = typeof run.total_elevation_gain === 'number' && Number.isFinite(run.total_elevation_gain)
    && run.total_elevation_gain >= 0 && run.total_elevation_gain / (run.distance / 1000) <= 5
  const knownFlat = knownGain && splits.length >= 4 && coverage >= run.distance * 0.9 && coverage <= run.distance * 1.1
    && splits.every((p: any) => p.distance > 0 && typeof p.elevation_difference === 'number' && Number.isFinite(p.elevation_difference) && Math.abs(p.elevation_difference / p.distance) <= 0.01)
  if (!knownFlat) return null
  const terrain = splits.reduce((sum: number, p: any) => {
    const slope = p.elevation_difference / p.distance
    const cost = (155.4 * slope ** 5 - 30.4 * slope ** 4 - 43.3 * slope ** 3 + 46.3 * slope ** 2 + 19.5 * slope + 3.6) / 3.6
    return sum + p.distance * cost
  }, 0) / coverage
  if (!Number.isFinite(terrain) || terrain < 0.95 || terrain > 1.05) return null
  const rpe = run.raw?.perceived_exertion ?? run.perceived_exertion
  const effort = typeof rpe === 'number' && rpe >= 1 && rpe <= 10 ? rpe >= 9 ? 'maximal' : 'submaximal' : 'unknown'
  return { key, seconds: normalizedRaceSeconds(seconds, wbgt, key, terrain), effort: effort as CalibrationObservation['effort'], source: official ? 'official_result' as const : 'full_elapsed' as const }
}

export function preRaceProjection(corpus: PerformanceCorpus, asOf: Date, useMarathonEndurance = false, calibration?: import('./projector').ProjectionInput['calibration']) {
  const fit = fitPerformanceCorpus(corpus, asOf)
  if (!fit || fit.fitQuality === 'low') return null
  const prior = corpus.runs.filter(r => !r.excluded_from_analysis && Date.parse(r.start_date) < asOf.getTime())
  const recent = prior.filter(r => Date.parse(r.start_date) >= asOf.getTime() - 60 * 86400000)
  if (recent.length < 3 || new Set(recent.map(r => runDay(r))).size < 3) return null
  const weather = new Map<number, number | null>(Array.from(corpus.conditions.entries()).map(([id, c]) => [id, c.wbgt_approx_c]))
  const drift = extractQualifiedDrift(recent, weather)
  return project({ fit, features: { aerobic: extractAerobic(recent), endurance: extractEndurance(recent, 60), form: extractForm(recent, asOf.getTime()),
    drift, marathonTraining: marathonTraining(prior, asOf, latestRunTimezone(prior), drift), windowDays: 60 }, useMarathonEndurance, calibration })
}

export function calibrationObservations(corpus: PerformanceCorpus, asOf: Date, useMarathonEndurance = false): CalibrationObservation[] {
  const cutoff = Date.parse(performanceCutoff(asOf))
  const candidates = corpus.runs.filter(r => Date.parse(r.start_date) >= cutoff && Date.parse(r.start_date) < asOf.getTime())
    .map(run => ({ run, outcome: raceOutcome(run, corpus.conditions) })).filter(r => r.outcome)
    .sort((a, b) => Date.parse(b.run.start_date) - Date.parse(a.run.start_date)).slice(0, 12)
  return candidates.flatMap(({ run, outcome }) => {
    const cutoff = new Date(run.start_date)
    const inherited = outcome!.key === 'fm' && useMarathonEndurance
      ? { hm: calibrateRaceResults(calibrationObservations(corpus, cutoff, false), 'hm', cutoff) } : undefined
    const prediction = preRaceProjection(corpus, cutoff, useMarathonEndurance, inherited)?.find(p => p.distanceKey === outcome!.key)
    if (!prediction) return []
    return [{ activityId: run.id, date: run.start_date, distanceKey: outcome!.key, actualIdealSecs: outcome!.seconds,
      predictedIdealSecs: prediction.idealSecs, effort: outcome!.effort, source: outcome!.source }]
  })
}
export function athleteCalibration(corpus: PerformanceCorpus, asOf: Date, useMarathonEndurance = false) {
  const observations = calibrationObservations(corpus, asOf, useMarathonEndurance)
  return Object.fromEntries((['5k', '10k', 'hm', 'fm'] as DistanceKey[]).map(key => [key, calibrateRaceResults(observations, key, asOf)]))
}
