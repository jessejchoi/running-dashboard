import { describe, expect, it } from 'vitest'
import { analyzeAllAndCombine } from '@/lib/analysis'
import { ANALYSIS_RUN_TYPES } from '@/lib/analysis/constants'

function lap(distanceM: number, movingTime: number, paceSecPerKm: number, average_heartrate?: number) {
  return {
    distance: distanceM,
    moving_time: movingTime,
    elapsed_time: movingTime,
    average_speed: 1000 / paceSecPerKm,
    average_heartrate,
  }
}

describe('analyzeAllAndCombine', () => {
  it('combines interval, threshold, easy, and race signals into all distance estimates', () => {
    const intervalRun = {
      id: 1,
      name: '6 x 3 min',
      start_date: '2026-05-01T06:00:00Z',
      distance: 7200,
      moving_time: 2400,
      average_speed: 1000 / 330,
      laps: [
        lap(1000, 360, 360, 135),
        lap(800, 180, 225, 172),
        lap(250, 100, 400, 145),
        lap(805, 180, 224, 174),
        lap(250, 100, 405, 146),
        lap(810, 180, 222, 176),
        lap(1000, 360, 365, 140),
      ],
    }

    const thresholdRun = {
      id: 2,
      name: 'Tempo 20',
      start_date: '2026-05-04T06:00:00Z',
      distance: 6000,
      moving_time: 1800,
      average_speed: 1000 / 300,
      average_heartrate: 168,
      splits: [
        lap(1000, 340, 340, 145),
        lap(1000, 300, 300, 166),
        lap(1000, 298, 298, 168),
        lap(1000, 302, 302, 169),
        lap(1000, 300, 300, 170),
        lap(1000, 360, 360, 150),
      ],
    }

    const easyRun = {
      id: 3,
      name: 'Easy aerobic',
      start_date: '2026-05-07T06:00:00Z',
      run_type: 'easy',
      distance: 8000,
      moving_time: 3200,
      average_speed: 1000 / 400,
      average_heartrate: 142,
      laps: [lap(8000, 3200, 400, 142)],
      splits: Array.from({ length: 8 }, (_, i) => lap(1000, 400, 398 + i, 138 + i)),
    }

    const raceRun = {
      id: 4,
      name: 'Parkrun 5K Race',
      start_date: '2026-05-10T06:00:00Z',
      distance: 5000,
      moving_time: 1260,
      average_speed: 5000 / 1260,
      is_race: true,
      matched_distance_key: '5k',
    }

    const result = analyzeAllAndCombine(
      [intervalRun],
      [thresholdRun],
      [],
      [easyRun],
      [raceRun],
      190,
      [
        { start_date: intervalRun.start_date, run_type: 'intervals', distance: intervalRun.distance },
        { start_date: thresholdRun.start_date, run_type: 'threshold', distance: thresholdRun.distance },
        { start_date: easyRun.start_date, run_type: 'easy', distance: easyRun.distance },
        { start_date: raceRun.start_date, run_type: 'race', distance: raceRun.distance },
      ],
    )

    expect(result.combined['5k']).not.toBeNull()
    expect(result.combined['10k']).not.toBeNull()
    expect(result.combined.hm).not.toBeNull()
    expect(result.combined.fm).not.toBeNull()

    const sources = new Set(result.allRaceEstimates.map(estimate => estimate.source))
    expect(sources).toEqual(new Set(['interval', 'threshold', 'race_result', 'easy_trend']))
  })

  it('keeps long_easy out of the long-run bucket to avoid double counting', () => {
    expect(ANALYSIS_RUN_TYPES.long).not.toContain('long_easy')
    expect(ANALYSIS_RUN_TYPES.easy).toContain('long_easy')
  })

  it('includes treadmill runs with lower estimate weight', () => {
    const treadmillEasyRun = {
      id: 30,
      name: 'Treadmill aerobic',
      start_date: '2026-05-12T06:00:00Z',
      run_type: 'easy',
      distance: 8000,
      moving_time: 3200,
      average_speed: 1000 / 400,
      average_heartrate: 142,
      raw: { trainer: true },
      laps: [lap(8000, 3200, 400, 142)],
      splits: Array.from({ length: 8 }, (_, i) => lap(1000, 400, 398 + i, 138 + i)),
    }

    const result = analyzeAllAndCombine(
      [],
      [],
      [],
      [treadmillEasyRun],
      [],
      190,
      [{ start_date: treadmillEasyRun.start_date, run_type: 'easy', distance: treadmillEasyRun.distance }],
    )

    expect(result.easyRunResults[0].excludedReason).toBeUndefined()
    const treadmillEstimates = result.allRaceEstimates.filter(estimate => estimate.activityId === treadmillEasyRun.id)
    expect(treadmillEstimates.length).toBeGreaterThan(0)
    expect(treadmillEstimates.every(estimate => estimate.weightMultiplier === 0.5)).toBe(true)
    expect(treadmillEstimates.every(estimate => estimate.method.includes('treadmill signal'))).toBe(true)
  })
})
