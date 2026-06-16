import { describe, expect, it } from 'vitest'
import { categorizeRun, detectRace, getTypesByGroup, isManualRunType, resolvePersistedRunType, type PaceZones } from '@/lib/run-classification'

const zones: PaceZones = {
  intervalMaxPace: 250,
  thresholdMaxPace: 300,
  tempoMaxPace: 325,
  easyMaxPace: 375,
  longRunThresholdKm: 14,
  source: 'user_goal',
}

function seg(pace: number, duration: number, distance = 1000) {
  return { average_speed: 1000 / pace, moving_time: duration, distance }
}

describe('categorizeRun', () => {
  it('classifies interval reps using user interval pace and recoveries', () => {
    const runType = categorizeRun({
      distance: 7000,
      average_speed: 1000 / 320,
      laps: [seg(360, 300), seg(245, 180), seg(355, 120), seg(248, 180), seg(370, 300)],
    }, zones, 190)
    expect(runType).toBe('intervals')
  })

  it('classifies structured threshold reps separately from intervals', () => {
    const runType = categorizeRun({
      distance: 8000,
      average_speed: 1000 / 335,
      laps: [seg(360, 600), seg(298, 600), seg(350, 180), seg(296, 600), seg(365, 600)],
    }, zones, 190)
    expect(runType).toBe('threshold')
  })

  it('classifies continuous tempo blocks', () => {
    const runType = categorizeRun({
      distance: 9000,
      average_speed: 1000 / 320,
      laps: [seg(350, 300), seg(322, 600), seg(320, 600), seg(355, 300)],
    }, zones, 190)
    expect(runType).toBe('tempo')
  })

  it('uses the user long-run distance threshold and faster block detection', () => {
    const runType = categorizeRun({
      distance: 18000,
      average_speed: 1000 / 355,
      laps: [seg(380, 1200), seg(370, 1200), seg(320, 900), seg(318, 900), seg(372, 1200)],
    }, zones, 190)
    expect(runType).toBe('long_progressive')
  })

  it('keeps long runs easy when no faster block exists', () => {
    const runType = categorizeRun({
      distance: 18000,
      average_speed: 1000 / 372,
      laps: [seg(378, 1200), seg(370, 1200), seg(374, 1200), seg(376, 1200)],
    }, zones, 190)
    expect(runType).toBe('long_easy')
  })

  it('classifies sustained faster long runs as long steady', () => {
    const runType = categorizeRun({
      distance: 18000,
      average_speed: 1000 / 345,
      laps: [seg(346, 1200), seg(342, 1200), seg(345, 1200), seg(347, 1200)],
    }, zones, 190)
    expect(runType).toBe('long_steady')
  })

  it('keeps marathon-pace blocks inside a long run as long progressive', () => {
    const runType = categorizeRun({
      distance: 24000,
      average_speed: 1000 / 355,
      laps: [
        seg(380, 1800),
        seg(323, 1200),
        seg(372, 600),
        seg(322, 1200),
        seg(372, 600),
        seg(321, 1200),
        seg(382, 1200),
      ],
    }, zones, 190)
    expect(runType).toBe('long_progressive')
  })

  it('classifies unmistakable long interval workouts as intervals', () => {
    const runType = categorizeRun({
      distance: 20000,
      average_speed: 1000 / 350,
      laps: [
        seg(380, 1800),
        seg(246, 180),
        seg(380, 150),
        seg(248, 180),
        seg(382, 150),
        seg(247, 180),
        seg(384, 150),
        seg(249, 180),
        seg(390, 1800),
      ],
    }, zones, 190)
    expect(runType).toBe('intervals')
  })

  it('classifies unmistakable long threshold workouts as threshold', () => {
    const runType = categorizeRun({
      distance: 22000,
      average_speed: 1000 / 345,
      laps: [
        seg(380, 1800),
        seg(298, 600),
        seg(350, 180),
        seg(296, 600),
        seg(352, 180),
        seg(297, 600),
        seg(385, 1800),
      ],
    }, zones, 190)
    expect(runType).toBe('threshold')
  })

  it('detects easy strides only when the overall run stays easy', () => {
    const runType = categorizeRun({
      distance: 7000,
      average_speed: 1000 / 355,
      laps: [seg(365, 300), seg(240, 20, 120), seg(370, 60, 250), seg(245, 20, 120), seg(368, 300)],
    }, zones, 190)
    expect(runType).toBe('easy_strides')
  })

  it('defaults to recovery for genuinely slow runs', () => {
    const runType = categorizeRun({
      distance: 8000,
      average_speed: 1000 / 390,
      laps: [seg(392, 600), seg(388, 600), seg(390, 600)],
      average_heartrate: 128,
    }, zones, 190)
    expect(runType).toBe('recovery')
  })

  it('detects race names and matches standard distances', () => {
    const detection = detectRace({
      name: 'Spring 10K Race',
      distance: 10020,
    })
    expect(detection.isRace).toBe(true)
    expect(detection.matchedDistanceKey).toBe('10k')
  })

  it('keeps treadmill as an environment label instead of a manual workout type', () => {
    const persisted = resolvePersistedRunType({
      automaticRunType: 'easy',
      isTreadmill: true,
      raceDetection: { isRace: false, matchedDistanceKey: null, matchedDistanceKm: null },
    })

    expect(persisted).toBe('easy')
    expect(isManualRunType('treadmill')).toBe(false)
    expect(Object.values(getTypesByGroup()).flat().some(type => type.key === 'treadmill')).toBe(false)
  })
})
