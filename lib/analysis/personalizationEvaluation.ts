import type { PerformanceCorpus } from './cpCorpus'
import { preRaceProjection, raceOutcome, athleteCalibration } from './raceCalibration'
import type { DistanceKey } from '@/lib/goals'

interface Row { date: string; distance: DistanceKey; effort: string; actual: number; baseline: number; calibrated: number; marathon: number; confidence: string }
/** Evaluate fixed candidate settings. Every race is predicted from an exclusive
 * start-time cutoff; calibration itself replays only earlier races. Settings
 * are not tuned on held-out results. Missing conditions/terrain are reported as
 * exclusions, not silently assigned ideal conditions. */
export function evaluatePersonalization(corpora: PerformanceCorpus[]) {
  const rows: Row[] = []
  let racesSeen = 0, usableOutcomes = 0
  for (const corpus of corpora) for (const run of corpus.runs) {
    if (run.excluded_from_analysis || !(run.is_race || run.run_type === 'race' || run.official_result_secs)) continue
    racesSeen++
    const outcome = raceOutcome(run, corpus.conditions)
    if (!outcome) continue
    usableOutcomes++
    const cutoff = new Date(run.start_date)
    const base = preRaceProjection(corpus, cutoff)?.find(p => p.distanceKey === outcome.key)
    const marathon = preRaceProjection(corpus, cutoff, true)?.find(p => p.distanceKey === outcome.key)
    if (!base || !marathon) continue
    const corrections = athleteCalibration(corpus, cutoff)
    rows.push({ date: run.start_date, distance: outcome.key, effort: outcome.effort, actual: outcome.seconds,
      baseline: base.idealSecs, calibrated: base.idealSecs * corrections[outcome.key].multiplier,
      marathon: marathon.idealSecs, confidence: marathon.confidence })
  }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  const dates = Array.from(new Set(rows.map(r => r.date.slice(0, 10)))).sort()
  const split = dates[Math.floor(dates.length * 0.7)]
  const training = rows.filter(r => r.date.slice(0, 10) < split), heldout = rows.filter(r => r.date.slice(0, 10) >= split)
  function stats(set: Row[], candidate: 'calibrated' | 'marathon') {
    const mean = (fn: (r: Row) => number) => set.length ? set.reduce((s, r) => s + fn(r), 0) / set.length : null
    return { count: set.length, maximal: set.filter(r => r.effort === 'maximal').length,
      mae: mean(r => Math.abs(r[candidate] - r.actual)), baselineMae: mean(r => Math.abs(r.baseline - r.actual)),
      optimisticError: mean(r => Math.max(0, r.actual - r[candidate])), baselineOptimisticError: mean(r => Math.max(0, r.actual - r.baseline)) }
  }
  function report(candidate: 'calibrated' | 'marathon') {
    const select = (r: Row) => candidate !== 'marathon' || r.distance === 'fm'
    const train = training.filter(select), held = heldout.filter(select)
    const result = stats(held, candidate)
    const byDistance = Object.fromEntries((['5k', '10k', 'hm', 'fm'] as DistanceKey[]).map(k => [k, stats(held.filter(r => r.distance === k), candidate)]))
    const required = candidate === 'marathon' ? ['fm'] : ['5k', '10k', 'hm']
    const enough = train.length >= 10 && held.length >= 10 && required.every(k => byDistance[k].count >= 3) && result.maximal >= 5
    const improved = result.mae != null && result.baselineMae != null && result.mae <= result.baselineMae
      && result.optimisticError != null && result.baselineOptimisticError != null && result.optimisticError < result.baselineOptimisticError
      && required.every(k => byDistance[k].mae! <= byDistance[k].baselineMae! && byDistance[k].optimisticError! <= byDistance[k].baselineOptimisticError!)
    return { gate: enough && improved ? 'pass' : 'disabled', reason: enough ? improved ? 'held-out improvement' : 'held-out regression or no optimistic-bias improvement' : 'insufficient chronological race evidence',
      training: stats(train, candidate), heldout: result, byDistance,
      byEvidence: Object.fromEntries(['low', 'medium', 'high'].map(q => [q, stats(held.filter(r => r.confidence === q), candidate)])) }
  }
  return { comparator: 'Weather-qualified CP core before demonstrated-race constraints; exclusive pre-race training, fixed current HR profile',
    limitations: 'Current classifications/HR settings were not historically versioned; full race effort may be unknown; this is retrospective validation.',
    racesSeen, usableOutcomes, splitDate: split ?? null, calibration: report('calibrated'), marathon: report('marathon'), rows }
}
