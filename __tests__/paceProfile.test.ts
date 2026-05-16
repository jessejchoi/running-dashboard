import { describe, expect, it } from 'vitest'
import { buildTrainingPaceZones, type PaceProfileActivity } from '@/lib/pace-profile'

const NOW = new Date('2026-05-15T00:00:00.000Z')

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * 86400000).toISOString()
}

function segment(pace: number, minutes: number, hr?: number) {
  const moving_time = minutes * 60
  return {
    average_speed: 1000 / pace,
    moving_time,
    elapsed_time: moving_time,
    distance: (moving_time / pace) * 1000,
    average_heartrate: hr,
  }
}

function run(overrides: Partial<PaceProfileActivity> & { days: number; pace: number; minutes?: number }): PaceProfileActivity {
  const minutes = overrides.minutes ?? 40
  const moving_time = minutes * 60
  return {
    id: overrides.id ?? overrides.days,
    name: overrides.name ?? 'Training run',
    type: 'Run',
    start_date: daysAgo(overrides.days),
    distance: (moving_time / overrides.pace) * 1000,
    moving_time,
    average_speed: 1000 / overrides.pace,
    average_heartrate: overrides.average_heartrate ?? 145,
    run_type: overrides.run_type ?? 'easy',
    laps: overrides.laps ?? [segment(overrides.pace, minutes, overrides.average_heartrate ?? 145)],
    splits: overrides.splits ?? Array.from({ length: Math.max(1, Math.floor(minutes / 5)) }, () => segment(overrides.pace, 5, overrides.average_heartrate ?? 145)),
    ...overrides,
  }
}

function distanceRun(id: number, days: number, distanceKm: number, minutes = 45): PaceProfileActivity {
  const moving_time = minutes * 60
  const pace = moving_time / distanceKm
  return run({
    id,
    days,
    pace,
    minutes,
    distance: distanceKm * 1000,
    moving_time,
    average_speed: (distanceKm * 1000) / moving_time,
    average_heartrate: 140,
    laps: [segment(pace, minutes, 140)],
    splits: Array.from({ length: Math.max(1, Math.floor(minutes / 5)) }, () => segment(pace, 5, 140)),
  })
}

describe('buildTrainingPaceZones', () => {
  it('produces training zones without race results or goals', () => {
    const activities = [
      run({ id: 1, days: 4, pace: 370 }),
      run({ id: 2, days: 8, pace: 365 }),
      run({ id: 3, days: 12, pace: 372 }),
      run({ id: 4, days: 18, pace: 368 }),
      run({ id: 5, days: 24, pace: 360 }),
      run({ id: 6, days: 30, pace: 375 }),
      run({ id: 7, days: 9, pace: 315, run_type: 'tempo', laps: [segment(315, 20, 165), segment(370, 10, 142)] }),
      run({ id: 8, days: 14, pace: 295, run_type: 'threshold', laps: [segment(295, 12, 172), segment(370, 5, 140), segment(292, 12, 174)] }),
      run({ id: 9, days: 20, pace: 330, run_type: 'intervals', laps: [segment(370, 10, 140), segment(255, 3, 176), segment(390, 2, 130), segment(258, 3, 178), segment(380, 10, 142)] }),
    ]

    const { zones } = buildTrainingPaceZones(activities, { maxHr: 190, now: NOW })

    expect(zones?.source).toBe('training')
    expect(zones?.easyMaxPace).toBeGreaterThan(zones!.tempoMaxPace)
    expect(zones?.tempoMaxPace).toBeGreaterThan(zones!.thresholdMaxPace)
    expect(zones?.thresholdMaxPace).toBeGreaterThan(zones!.intervalMaxPace)
    expect(zones?.sampleSize).toBeGreaterThan(0)
  })

  it('adapts faster when recent easy training gets faster', () => {
    const olderSlow = Array.from({ length: 6 }, (_, i) => run({ id: i + 1, days: 70 - i * 5, pace: 410 }))
    const recentFast = Array.from({ length: 6 }, (_, i) => run({ id: i + 20, days: 4 + i * 3, pace: 350 }))
    const { zones } = buildTrainingPaceZones([...olderSlow, ...recentFast], { now: NOW })

    expect(zones?.easyAnchorPace).toBeLessThan(380)
  })

  it('adapts slower when recent easy training gets slower', () => {
    const olderFast = Array.from({ length: 6 }, (_, i) => run({ id: i + 1, days: 70 - i * 5, pace: 340 }))
    const recentSlow = Array.from({ length: 6 }, (_, i) => run({ id: i + 20, days: 4 + i * 3, pace: 405 }))
    const { zones } = buildTrainingPaceZones([...olderFast, ...recentSlow], { now: NOW })

    expect(zones?.easyAnchorPace).toBeGreaterThan(365)
  })

  it('works without heart-rate data', () => {
    const activities = Array.from({ length: 6 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 5,
      pace: 370 + i,
      average_heartrate: undefined,
      laps: [segment(370 + i, 40)],
      splits: [segment(370 + i, 10), segment(371 + i, 10), segment(369 + i, 10), segment(372 + i, 10)],
    }))

    const { zones } = buildTrainingPaceZones(activities, { now: NOW })

    expect(zones?.source).toBe('training')
    expect(zones?.confidence).toBeTruthy()
  })

  it('returns null when there is not enough training data', () => {
    const { zones } = buildTrainingPaceZones([
      run({ id: 1, days: 2, pace: 370 }),
      run({ id: 2, days: 8, pace: 365 }),
    ], { now: NOW })

    expect(zones).toBeNull()
  })

  it('does not treat frequent high-HR steady running as true easy pace', () => {
    const hardSteady = Array.from({ length: 6 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 4,
      pace: 330,
      average_heartrate: 162,
      laps: [segment(330, 40, 162)],
      splits: Array.from({ length: 8 }, () => segment(330, 5, 162)),
    }))

    const { zones } = buildTrainingPaceZones(hardSteady, { maxHr: 190, now: NOW })

    expect(zones?.easyAnchorPace).toBeGreaterThan(360)
    expect(zones?.qualityWarnings?.some(w => w.includes('higher-HR'))).toBe(true)
  })

  it('does not let low-HR recovery runs drag the central easy anchor too slow', () => {
    const aerobic = Array.from({ length: 5 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 5,
      pace: 365,
      average_heartrate: 140,
      laps: [segment(365, 40, 140)],
      splits: Array.from({ length: 8 }, () => segment(365, 5, 140)),
    }))
    const recovery = Array.from({ length: 5 }, (_, i) => run({
      id: i + 20,
      days: 4 + i * 5,
      pace: 430,
      average_heartrate: 118,
      laps: [segment(430, 35, 118)],
      splits: Array.from({ length: 7 }, () => segment(430, 5, 118)),
    }))

    const { zones } = buildTrainingPaceZones([...aerobic, ...recovery], { maxHr: 190, now: NOW })

    expect(zones?.easyAnchorPace).toBeLessThan(390)
    expect(zones?.easyMaxPace).toBeGreaterThan(zones!.easyAnchorPace!)
  })

  it('does not let one overlapping sustained-run source create high confidence', () => {
    const singleRun = run({
      id: 1,
      days: 3,
      pace: 350,
      minutes: 90,
      average_heartrate: 142,
      laps: [segment(350, 90, 142)],
      splits: Array.from({ length: 18 }, () => segment(350, 5, 142)),
    })
    const filler = [
      run({ id: 2, days: 8, pace: 365, average_heartrate: 140 }),
      run({ id: 3, days: 16, pace: 370, average_heartrate: 140 }),
    ]

    const { zones } = buildTrainingPaceZones([singleRun, ...filler], { maxHr: 190, now: NOW })

    expect(zones?.confidence).not.toBe('high')
    expect(zones?.uniqueActivityCount).toBe(3)
  })

  it('does not let bad legacy automatic run types poison easy anchors', () => {
    const mislabeled = Array.from({ length: 6 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 4,
      pace: 365,
      run_type: 'threshold',
      run_type_manual: false,
      average_heartrate: 140,
      laps: [segment(365, 40, 140)],
      splits: Array.from({ length: 8 }, () => segment(365, 5, 140)),
    }))

    const { zones } = buildTrainingPaceZones(mislabeled, { maxHr: 190, now: NOW })

    expect(zones?.easyAnchorPace).toBeLessThan(380)
  })

  it('sets long-run threshold from weekly long-run median and recent distance distribution', () => {
    const weeklyLongs = [5, 12, 19, 26].map((days, i) => distanceRun(i + 1, days, 15, 90))
    const regularRuns = Array.from({ length: 12 }, (_, i) =>
      distanceRun(20 + i, 2 + i * 2, 6 + Math.floor(i / 3), 45),
    )

    const { zones } = buildTrainingPaceZones([...weeklyLongs, ...regularRuns], { maxHr: 190, now: NOW })

    expect(zones?.longRunThresholdKm).toBe(13.5)
    expect(zones?.medianWeeklyLongestRunKm).toBe(15)
    expect(zones?.p75RunDistanceKm).toBe(9)
    expect(zones?.longRunThresholdReason).toMatch(/weekly long-run median/)
  })

  it('uses p75 recent distance when frequent medium-long runs exceed the weekly-long signal', () => {
    const weeklyLongs = [5, 12, 19, 26].map((days, i) => distanceRun(i + 1, days, 13, 80))
    const regularRuns = Array.from({ length: 12 }, (_, i) =>
      distanceRun(20 + i, 2 + i * 2, 12, 75),
    )

    const { zones } = buildTrainingPaceZones([...weeklyLongs, ...regularRuns], { maxHr: 190, now: NOW })

    expect(zones?.longRunThresholdKm).toBe(12)
    expect(zones?.medianWeeklyLongestRunKm).toBe(13)
    expect(zones?.p75RunDistanceKm).toBe(12)
    expect(zones?.longRunThresholdReason).toMatch(/p75 recent run distance/)
  })

  it('clamps low-volume long-run thresholds to 8km', () => {
    const weeklyLongs = [5, 12, 19, 26].map((days, i) => distanceRun(i + 1, days, 8.5, 55))
    const regularRuns = Array.from({ length: 12 }, (_, i) =>
      distanceRun(20 + i, 2 + i * 2, 4 + Math.min(2, Math.floor(i / 4)), 35),
    )

    const { zones } = buildTrainingPaceZones([...weeklyLongs, ...regularRuns], { maxHr: 190, now: NOW })

    expect(zones?.longRunThresholdKm).toBe(8)
  })

  it('falls back to 12km with insufficient weekly long-run history', () => {
    const activities = [
      distanceRun(1, 5, 15, 90),
      distanceRun(2, 12, 13, 80),
      distanceRun(3, 19, 11, 70),
    ]

    const { zones } = buildTrainingPaceZones(activities, { maxHr: 190, now: NOW })

    expect(zones?.longRunThresholdKm).toBe(12)
    expect(zones?.longRunThresholdReason).toMatch(/fewer than 4/)
  })

  it('ignores races, treadmills, and excluded runs for long-run threshold', () => {
    const weeklyLongs = [5, 12, 19, 26].map((days, i) => distanceRun(i + 1, days, 15, 90))
    const regularRuns = Array.from({ length: 12 }, (_, i) =>
      distanceRun(20 + i, 2 + i * 2, 6 + Math.floor(i / 3), 45),
    )
    const excludedMarathon = run({
      id: 99,
      days: 10,
      pace: 360,
      minutes: 240,
      distance: 42195,
      moving_time: 240 * 60,
      average_speed: 42195 / (240 * 60),
      is_race: true,
    })
    const treadmillThirty = {
      ...distanceRun(100, 17, 30, 180),
      run_type: 'treadmill',
    }
    const manuallyExcludedThirty = {
      ...distanceRun(101, 24, 30, 180),
      excluded_from_analysis: true,
    }

    const { zones } = buildTrainingPaceZones(
      [...weeklyLongs, ...regularRuns, excludedMarathon, treadmillThirty, manuallyExcludedThirty],
      { maxHr: 190, now: NOW },
    )

    expect(zones?.longRunThresholdKm).toBe(13.5)
    expect(zones?.medianWeeklyLongestRunKm).toBe(15)
    expect(zones?.p75RunDistanceKm).toBe(9)
  })

  it('uses splits for steady windows even when a single coarse lap exists', () => {
    const activities = Array.from({ length: 5 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 5,
      pace: 365,
      average_heartrate: 140,
      laps: [segment(330, 40, 165)],
      splits: Array.from({ length: 8 }, () => segment(365, 5, 140)),
    }))

    const { zones } = buildTrainingPaceZones(activities, { maxHr: 190, now: NOW })

    expect(zones?.easyAnchorPace).toBeGreaterThan(350)
  })

  it('downweights hilly runs relative to flatter comparable runs', () => {
    const flat = Array.from({ length: 5 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 4,
      pace: 365,
      average_heartrate: 140,
      total_elevation_gain: 20,
    }))
    const hilly = Array.from({ length: 5 }, (_, i) => run({
      id: i + 20,
      days: 4 + i * 4,
      pace: 430,
      average_heartrate: 140,
      total_elevation_gain: 500,
    }))

    const { zones } = buildTrainingPaceZones([...flat, ...hilly], { maxHr: 190, now: NOW })

    expect(zones?.easyAnchorPace).toBeLessThan(400)
  })

  it('keeps final confidence, reason, and diagnostics aligned', () => {
    const activities = Array.from({ length: 6 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 5,
      pace: 370 + i,
      average_heartrate: undefined,
      laps: [segment(370 + i, 40)],
      splits: Array.from({ length: 8 }, () => segment(370 + i, 5)),
    }))

    const { zones } = buildTrainingPaceZones(activities, { now: NOW })

    expect(zones?.hrReliability).toBe('missing')
    expect(zones?.confidence).not.toBe('high')
    expect(zones?.reason).toMatch(/partial|limited|uneven/i)
    expect(zones?.qualityWarnings?.some(w => w.includes('heart-rate unavailable'))).toBe(true)
  })

  it('anchors hard zones on easy pace and only nudges them with workout evidence', () => {
    const easyRuns = Array.from({ length: 8 }, (_, i) => run({
      id: i + 1,
      days: 3 + i * 4,
      pace: 370,
      average_heartrate: 140,
      laps: [segment(370, 40, 140)],
      splits: Array.from({ length: 8 }, () => segment(370, 5, 140)),
    }))
    const veryFastWorkouts = Array.from({ length: 4 }, (_, i) => run({
      id: i + 50,
      days: 4 + i * 7,
      pace: 300,
      run_type: 'intervals',
      average_heartrate: 172,
      laps: [segment(370, 10, 140), segment(220, 4, 176), segment(390, 3, 132), segment(222, 4, 178), segment(370, 10, 142)],
      splits: [segment(370, 5, 140), segment(220, 4, 176), segment(390, 3, 132), segment(222, 4, 178), segment(370, 5, 142)],
    }))

    const { zones } = buildTrainingPaceZones([...easyRuns, ...veryFastWorkouts], { maxHr: 190, now: NOW })
    const easyAnchor = zones!.easyAnchorPace!

    expect(zones?.tempoMaxPace).toBeCloseTo(easyAnchor * 0.90, 0)
    expect(zones!.intervalMaxPace).toBeGreaterThan(easyAnchor * 0.78 * 0.90)
    expect(zones!.intervalMaxPace).toBeLessThan(easyAnchor * 0.78 * 1.10)
  })
})
