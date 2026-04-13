import { describe, expect, it } from 'vitest'
import { analyzeIntervalSession } from '@/lib/analysis'

function lap(distanceM: number, movingTime: number, paceSecPerKm: number, average_heartrate?: number) {
  return {
    distance: distanceM,
    moving_time: movingTime,
    average_speed: 1000 / paceSecPerKm,
    average_heartrate,
  }
}

describe('analyzeIntervalSession', () => {
  it('detects short one-minute reps as hard efforts', () => {
    const analysis = analyzeIntervalSession({
      id: 1,
      name: '10 x 1 min',
      start_date: '2026-04-13T06:00:00Z',
      average_speed: 1000 / 320,
      laps: [
        lap(1000, 360, 360, 135),
        lap(280, 59, 211, 172),
        lap(200, 90, 450, 145),
        lap(285, 59, 207, 174),
        lap(200, 90, 450, 146),
        lap(290, 59, 203, 176),
        lap(1000, 360, 360, 140),
      ],
    }, 190)

    expect(analysis).not.toBeNull()
    expect(analysis?.effortsUsed).toBe(3)
    expect(analysis?.allEfforts.map(rep => rep.durationSecs)).toEqual([59, 59, 59])
    expect(analysis?.allEfforts.map(rep => rep.distanceM)).toEqual([280, 285, 290])
    expect(analysis?.recoveryLaps).toHaveLength(2)
  })
})
