import {
  extractAerobic,
  extractEndurance,
  extractForm,
  extractDrift,
} from './features'
import { project } from './projector'
import {
  estimateObserved,
  confirmedRace,
  type ObservationRun,
  type ObservationEffort,
} from './expected'
import {
  adjustBestEffortsToRaceHR,
  fitCriticalPace,
  predictTimeForDistance,
  type BestEffortPoint,
} from './criticalPace'
import { distanceKm, type DistanceKey } from '@/lib/goals'
export interface EvaluationAthlete {
  runs: ObservationRun[]
  efforts: ObservationEffort[]
  maxHr?: number
}
export interface EvaluationRow {
  date: string
  distance: DistanceKey
  actual: number
  expected: number | null
  baseline: number | null
  confidence: string
  covered: boolean | null
}
/** Recompute every prediction with an exclusive race-start cutoff. Neither held-out
 * race segments nor later training enter either model. Baseline is the legacy
 * HR-adjusted capability curve; the report explicitly names that comparator. */
export function evaluateCorpus(
  athletes: EvaluationAthlete[],
  calibration = { huberDelta: 0.15, raceWeight: 0.9 },
) {
  const rows: EvaluationRow[] = []
  for (const athlete of athletes)
    for (const race of athlete.runs.filter(
      (r) => confirmedRace(r) && !r.excluded_from_analysis,
    )) {
      const key = (['5k', '10k', 'hm', 'fm'] as DistanceKey[]).find(
        (k) => Math.abs(race.distance / 1000 / distanceKm(k) - 1) < 0.03,
      )
      const actual = race.official_result_secs ?? race.elapsed_time
      if (!key || !actual) continue
      const cutoff = new Date(race.start_date),
        from = cutoff.getTime() - 60 * 86400000
      const prior = athlete.runs.filter(
        (r) =>
          new Date(r.start_date) < cutoff &&
          new Date(r.start_date).getTime() >= from &&
          !r.excluded_from_analysis,
      )
      const ids = new Set(prior.map((r) => r.id))
      const efforts = athlete.efforts.filter((e) => ids.has(e.activity_id))
      const expected = estimateObserved(
        prior,
        efforts,
        cutoff,
        null,
        calibration,
      ).find((e) => e.distanceKey === key)!
      const points: BestEffortPoint[] = efforts.map((e) => ({
        durationSecs: e.duration_secs,
        paceSecPerKm: e.best_pace_sec_per_km,
        date: prior.find((r) => r.id === e.activity_id)!.start_date,
        activityId: e.activity_id,
        avgHR: (e as any).avg_hr,
      }))
      for (const run of prior.filter(
        (r) =>
          confirmedRace(r) ||
          r.moving_time > 5400 ||
          ['threshold', 'tempo', 'long_progressive'].includes(r.run_type ?? ''),
      ))
        points.push({
          durationSecs: run.moving_time,
          paceSecPerKm: run.moving_time / (run.distance / 1000),
          date: run.start_date,
          activityId: run.id,
          weight: confirmedRace(run) ? 200 : 1,
          avgHR: (run as any).average_heartrate,
        })
      const fit = fitCriticalPace(
        adjustBestEffortsToRaceHR(points, athlete.maxHr ?? 195),
      )
      const raceAnchors = prior
        .filter((r) => r.is_race || r.run_type === 'race')
        .flatMap((r) => {
          const k = (['5k', '10k', 'hm', 'fm'] as DistanceKey[]).find(
            (k) =>
              Math.abs(r.distance / 1000 / distanceKm(k) - 1) <
              { '5k': 0.08, '10k': 0.08, hm: 0.06, fm: 0.04 }[k],
          )
          return k
            ? [
                {
                  distanceKey: k,
                  observedSecs:
                    r.moving_time *
                    Math.pow(distanceKm(k) / (r.distance / 1000), 1.06),
                },
              ]
            : []
        })
      const baseline = fit
        ? (project({
            fit,
            features: {
              aerobic: extractAerobic(prior as any),
              endurance: extractEndurance(prior as any, 60),
              form: extractForm(prior as any, cutoff.getTime()),
              drift: extractDrift(prior as any),
              windowDays: 60,
            },
            raceAnchors,
          }).find((p) => p.distanceKey === key)?.todaySecs ?? null)
        : null
      rows.push({
        date: race.start_date,
        distance: key,
        actual,
        expected: expected.expectedSecs,
        baseline,
        confidence: expected.confidence,
        covered:
          expected.lowSecs != null
            ? actual >= expected.lowSecs && actual <= expected.highSecs!
            : null,
      })
    }
  rows.sort((a, b) => a.date.localeCompare(b.date))
  // Calendar split, not row split: races on the same day cannot straddle sets.
  const dates = Array.from(
      new Set(rows.map((r) => r.date.slice(0, 10))),
    ).sort(),
    split = dates[Math.max(0, Math.floor(dates.length * 0.7))]
  const training = rows.filter((r) => r.date.slice(0, 10) < split),
    heldout = rows.filter((r) => r.date.slice(0, 10) >= split)
  function stats(set: EvaluationRow[]) {
    const paired = set.filter((r) => r.expected != null && r.baseline != null)
    const mean = (f: (r: EvaluationRow) => number) =>
      paired.length
        ? paired.reduce((n, r) => n + f(r), 0) / paired.length
        : null
    return {
      races: set.length,
      predictions: set.filter((r) => r.expected != null).length,
      paired: paired.length,
      mae: mean((r) => Math.abs(r.expected! - r.actual)),
      baselineMae: mean((r) => Math.abs(r.baseline! - r.actual)),
      optimisticError: mean((r) => Math.max(0, r.actual - r.expected!)),
      baselineOptimisticError: mean((r) => Math.max(0, r.actual - r.baseline!)),
      intervalCoverage: mean((r) => (r.covered ? 1 : 0)),
    }
  }
  const byDistance = Object.fromEntries(
    (['5k', '10k', 'hm', 'fm'] as DistanceKey[]).map((k) => [
      k,
      stats(heldout.filter((r) => r.distance === k)),
    ]),
  )
  const byEvidence = Object.fromEntries(
    ['low', 'medium', 'high'].map((k) => [
      k,
      stats(heldout.filter((r) => r.confidence === k)),
    ]),
  )
  const summary = stats(heldout)
  const gate =
    training.length >= 10 &&
    heldout.length >= 10 &&
    Object.values(byDistance).every(
      (s) =>
        s.paired >= 3 &&
        s.mae! <= s.baselineMae! &&
        s.optimisticError! <= s.baselineOptimisticError!,
    ) &&
    summary.optimisticError! < summary.baselineOptimisticError!
  return {
    comparator:
      'Legacy HR-adjusted CP projector, reconstructed at race start; weather unavailable for both models',
    calibration,
    splitDate: split ?? null,
    training: stats(training),
    heldout: summary,
    byDistance,
    byEvidence,
    gate: gate ? 'pass' : 'disabled_insufficient_evidence_or_regression',
    rows,
  }
}

/** Select parameters on the chronological training partition only. */
export function calibrateAndEvaluate(athletes: EvaluationAthlete[]) {
  const initial = evaluateCorpus(athletes)
  const candidates = [0.1, 0.15, 0.2].flatMap((huberDelta) =>
    [0.7, 0.9].map((raceWeight) => ({ huberDelta, raceWeight })),
  )
  const ranked = candidates
    .map((calibration) => ({
      calibration,
      report: evaluateCorpus(athletes, calibration),
    }))
    .sort(
      (a, b) =>
        (a.report.training.mae ?? Infinity) -
        (b.report.training.mae ?? Infinity),
    )
  const selected =
    initial.training.paired >= 10
      ? ranked[0].calibration
      : { huberDelta: 0.15, raceWeight: 0.9 }
  return {
    ...evaluateCorpus(athletes, selected),
    selectedCalibration: selected,
    calibrationEvidence:
      initial.training.paired >= 10
        ? 'chronological training MAE'
        : 'insufficient training pairs; defaults retained',
    candidateTrainingScores: ranked.map((r) => ({
      calibration: r.calibration,
      training: r.report.training,
    })),
  }
}
