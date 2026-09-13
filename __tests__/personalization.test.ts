import { afterEach, describe, expect, it, vi } from 'vitest'
import { calibrateRaceResults, marathonTraining, projectMarathon, personalizationVersion, raceCalibrationEnabled, marathonEnduranceEnabled, type CalibrationObservation } from '@/lib/analysis/personalization'
import { extractQualifiedDrift } from '@/lib/analysis/qualifiedDrift'
import { raceOutcome, preRaceProjection } from '@/lib/analysis/raceCalibration'
import { fitPerformanceCorpus } from '@/lib/analysis/cpCorpus'
const asOf = new Date('2026-09-13T12:00:00Z')
const observation: CalibrationObservation = { activityId: 1, date: '2026-08-10T00:00:00Z', distanceKey: '5k', actualIdealSecs: 1200, predictedIdealSecs: 1260, effort: 'maximal', source: 'official_result' }
function easyRun(id: number) {
  return { id, start_date: '2026-08-01T00:00:00Z', distance: 15000, moving_time: 5400, average_speed: 15000 / 5400, average_heartrate: 148,
    suffer_score: null, run_type: 'easy', raw: {}, laps: [{ moving_time: 5400, elapsed_time: 5400, average_speed: 15000 / 5400, average_heartrate: 148 }], excluded_from_analysis: false, total_elevation_gain: 0,
    splits: Array.from({ length: 15 }, (_, i) => ({ distance: 1000, moving_time: 360, elapsed_time: 360, average_speed: 1000 / 360, average_heartrate: 135 + i * 2, elevation_difference: 0 })) }
}
afterEach(() => { vi.unstubAllEnvs() })
describe('weather-qualified drift', () => {
  it('retains raw drift but applies no finish-time penalty from hot/unknown/indoor evidence', () => {
    const runs = [easyRun(1), easyRun(2), { ...easyRun(3), raw: { trainer: true } }]
    const result = extractQualifiedDrift(runs, new Map([[1, 26], [3, 15]]))
    expect(result.sampleSize).toBe(3)
    expect(result.avgExcessDriftPct).toBeGreaterThan(0)
    expect(result.penaltyExcessDriftPct).toBeNull()
    expect(result.excluded).toMatchObject({ heat: 1, missingWeather: 2 })
  })
  it('requires repeated cool, flat, stable easy efforts; rejects hills and variable pacing', () => {
    const runs = [easyRun(1), easyRun(2), easyRun(3)]
    const weather = new Map([[1, 15], [2, 16], [3, 17]])
    expect(extractQualifiedDrift(runs, weather).penaltyExcessDriftPct).toBeGreaterThan(0)
    expect(extractQualifiedDrift(runs, weather).longRunPaceFadePct).toBeCloseTo(0)
    runs[0].total_elevation_gain = 200
    expect(extractQualifiedDrift(runs, weather).penaltyExcessDriftPct).toBeNull()
    runs[0].total_elevation_gain = 0
    runs[0].splits[4].average_speed = 5
    expect(extractQualifiedDrift(runs, weather).penaltyExcessDriftPct).toBeNull()
  })
})
describe('personal race calibration', () => {
  it('learns both directions only for maximal races, and shrinks sparse residuals', () => {
    const faster = calibrateRaceResults([observation], '5k', asOf)
    expect(faster.multiplier).toBeLessThan(1)
    expect(faster.multiplier).toBeGreaterThan(1200 / 1260)
    expect(calibrateRaceResults([{ ...observation, actualIdealSecs: 1320 }], '5k', asOf).multiplier).toBeGreaterThan(1)
    for (const effort of ['unknown', 'submaximal'] as const) {
      expect(calibrateRaceResults([{ ...observation, effort, actualIdealSecs: 1320 }], '5k', asOf).multiplier).toBe(1)
      expect(calibrateRaceResults([{ ...observation, effort }], '5k', asOf).multiplier).toBeLessThan(1)
    }
  })
  it('isolates distances, deduplicates activity evidence, excludes current/future and old results', () => {
    expect(calibrateRaceResults([observation], 'hm', asOf).multiplier).toBe(1)
    expect(calibrateRaceResults([observation, observation], '5k', asOf).sampleSize).toBe(1)
    for (const date of [asOf.toISOString(), '2026-12-01', '2025-01-01']) expect(calibrateRaceResults([{ ...observation, date }], '5k', asOf).sampleSize).toBe(0)
  })
  it('uses full/official results, treats unknown effort conservatively, and rejects ambiguous course/weather', () => {
    const run = { ...easyRun(1), is_race: true, distance: 15000 }
    expect(raceOutcome(run, new Map([[1, { wbgt_approx_c: 15 }]]))).toBeNull()
    const race = { ...easyRun(1), distance: 5000, elapsed_time: 1300, moving_time: 1200, is_race: true, splits: easyRun(1).splits.slice(0, 5) }
    expect(raceOutcome(race, new Map([[1, { wbgt_approx_c: 15 }]]))).toMatchObject({ seconds: 1300, effort: 'unknown', source: 'full_elapsed' })
    expect(raceOutcome({ ...race, official_result_secs: 1280, raw: { perceived_exertion: 9 } }, new Map([[1, { wbgt_approx_c: 15 }]]))).toMatchObject({ seconds: 1280, effort: 'maximal' })
    expect(raceOutcome(race, new Map())).toBeNull()
    expect(raceOutcome({ ...race, total_elevation_gain: 300 }, new Map([[1, { wbgt_approx_c: 15 }]]))).toBeNull()
    expect(raceOutcome({ ...race, total_elevation_gain: undefined }, new Map([[1, { wbgt_approx_c: 15 }]]))).toBeNull()
    expect(raceOutcome({ ...race, distance: 4900 }, new Map([[1, { wbgt_approx_c: 15 }]]))).toBeNull()
  })
  it('does not admit race-day or later runs/segments into the pre-race fit', () => {
    const runs = [easyRun(1), { ...easyRun(2), start_date: '2026-08-02T00:00:00Z' }, { ...easyRun(3), start_date: '2026-08-03T00:00:00Z' }]
    const efforts = [180, 600, 1200, 2700].map((duration_secs, i) => ({ activity_id: 1, duration_secs, best_pace_sec_per_km: 250 + i * 15 }))
    const corpus = { runs, efforts, maxHr: 195, conditions: new Map() }
    const before = fitPerformanceCorpus(corpus, asOf)
    const leaked = { ...corpus, runs: [...runs, { ...easyRun(99), start_date: asOf.toISOString(), is_race: true }], efforts: [...efforts, { activity_id: 99, duration_secs: 600, best_pace_sec_per_km: 120 }] }
    expect(fitPerformanceCorpus(leaked, asOf)).toEqual(before)
    expect(preRaceProjection(corpus, asOf)).not.toBeNull()
    expect(preRaceProjection(leaked, asOf)).toEqual(preRaceProjection(corpus, asOf))
  })
})
describe('marathon training', () => {
  it('uses full Jakarta weeks, counts separate daily runs, and keeps zero weeks', () => {
    const runs = [{ ...easyRun(1), start_date: '2026-06-01T00:00:00Z' },
      { ...easyRun(2), start_date: '2026-09-06T10:00:00Z', moving_time: 7500, distance: 26000 },
      { ...easyRun(3), start_date: '2026-09-06T12:00:00Z', moving_time: 7500, distance: 26000 },
      // Monday Jakarta: this is in the incomplete current week and must not count.
      { ...easyRun(4), start_date: '2026-09-06T18:00:00Z', moving_time: 8000, distance: 30000 }]
    const training = marathonTraining(runs, asOf)
    expect(training.weeklyKm).toHaveLength(12)
    expect(training.runsOver25Km).toBe(2)
    expect(training.runsOver120Mins).toBe(2)
    expect(training.weeklyKm.filter(k => k === 0).length).toBeGreaterThan(0)
    expect(training.averageWeeklyKm).toBeCloseTo(52 / 12)
  })
  it('distinguishes consistent higher-volume preparation without stacking a second drift penalty', () => {
    const empty = marathonTraining([], asOf)
    expect(projectMarathon(6300, empty)).toBeNull()
    const low = { ...empty, coveredWeeks: 12, averageWeeklyKm: 40, consistentWeeks: 8, runsOver90Mins: 7, runsOver120Mins: 2, runsOver25Km: 0 }
    const high = { ...low, averageWeeklyKm: 70, consistentWeeks: 12, runsOver90Mins: 12, runsOver120Mins: 6, runsOver25Km: 4, runsOver30Km: 2, latePaceFadePct: 0, latePaceSampleSize: 4 }
    expect(projectMarathon(6300, high)!.idealSecs).toBeLessThan(projectMarathon(6300, low)!.idealSecs)
    expect(projectMarathon(6300, low)!.confidence).toBe('low')
    expect(projectMarathon(6300, high)!.bandPct).toBeLessThan(projectMarathon(6300, low)!.bandPct)
  })
  it('enables only race calibration by default and allows explicit rollback', () => {
    vi.stubEnv('RACE_CALIBRATION_ENABLED', ''); delete process.env.RACE_CALIBRATION_ENABLED
    vi.stubEnv('MARATHON_ENDURANCE_ENABLED', ''); delete process.env.MARATHON_ENDURANCE_ENABLED
    expect(raceCalibrationEnabled()).toBe(true)
    expect(marathonEnduranceEnabled()).toBe(false)
    expect(personalizationVersion()).toBe('-race1')
    vi.stubEnv('RACE_CALIBRATION_ENABLED', 'false')
    expect(raceCalibrationEnabled()).toBe(false)
    expect(personalizationVersion()).toBe('')
  })
  it('versions calibration and marathon rollouts independently', () => {
    vi.stubEnv('RACE_CALIBRATION_ENABLED', 'false'); vi.stubEnv('MARATHON_ENDURANCE_ENABLED', 'false')
    expect(personalizationVersion()).toBe('')
    vi.stubEnv('RACE_CALIBRATION_ENABLED', 'true'); expect(personalizationVersion()).toBe('-race1')
    vi.stubEnv('MARATHON_ENDURANCE_ENABLED', 'true'); expect(personalizationVersion()).toBe('-race1-marathon1')
  })
})

it('keeps gates closed when chronological validation has no usable race pairs', async () => {
  const { evaluatePersonalization } = await import('@/lib/analysis/personalizationEvaluation')
  const report = evaluatePersonalization([{ runs: [], efforts: [], conditions: new Map(), maxHr: 195 }])
  expect(report.calibration.gate).toBe('disabled')
  expect(report.marathon.gate).toBe('disabled')
  expect(report.calibration.heldout.mae).toBeNull()
  expect(report.marathon.heldout.count).toBe(0)
})
