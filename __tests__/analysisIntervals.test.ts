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
  function buildSession(repSpecs: { distanceM: number; movingTime: number; pace: number; hr?: number }[], recoveryTime: number = 90) {
    const warmup = lap(1000, 360, 360, 135)
    const cooldown = lap(1000, 360, 360, 140)
    const recoveries = repSpecs.slice(0, -1).map(() => lap(200, recoveryTime, 450, 145))

    const laps = [warmup]
    repSpecs.forEach((rep, idx) => {
      laps.push(lap(rep.distanceM, rep.movingTime, rep.pace, rep.hr))
      if (idx < recoveries.length) laps.push(recoveries[idx])
    })
    laps.push(cooldown)

    const totalDistance = laps.reduce((sum, item) => sum + item.distance, 0)
    const totalTime = laps.reduce((sum, item) => sum + item.moving_time, 0)

    return {
      id: 1,
      name: 'Intervals',
      start_date: '2026-04-13T06:00:00Z',
      average_speed: totalDistance / totalTime,
      laps,
    }
  }

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

  it('does not include a treadmill warmup as interval work when recoveries drag down average pace', () => {
    const analysis = analyzeIntervalSession({
      id: 2,
      name: 'Treadmill 3 x 3 min',
      start_date: '2026-04-13T06:00:00Z',
      average_speed: 1000 / 380,
      laps: [
        lap(1200, 402, 335, 142),
        lap(750, 180, 240, 174),
        lap(180, 110, 610, 140),
        lap(755, 180, 238, 176),
        lap(180, 110, 610, 142),
        lap(760, 180, 237, 178),
        lap(1000, 410, 410, 138),
      ],
    }, 190)

    expect(analysis).not.toBeNull()
    expect(analysis?.effortsUsed).toBe(3)
    expect(analysis?.allEfforts.map(rep => rep.lapIndex)).toEqual([2, 4, 6])
    expect(analysis?.allEfforts.map(rep => Math.round(rep.paceSecPerKm))).toEqual([240, 238, 237])
  })

  it('penalizes one-minute reps more than longer reps at the same pace', () => {
    const shortReps = analyzeIntervalSession(buildSession(
      Array.from({ length: 6 }, () => ({ distanceM: 280, movingTime: 60, pace: 214, hr: 172 })),
      60
    ), 190)
    const longReps = analyzeIntervalSession(buildSession(
      Array.from({ length: 6 }, () => ({ distanceM: 1120, movingTime: 240, pace: 214, hr: 172 })),
      240
    ), 190)

    expect(shortReps).not.toBeNull()
    expect(longReps).not.toBeNull()
    expect(shortReps?.correctionFactor).toBeGreaterThan((longReps?.correctionFactor ?? 0) + 0.05)
    expect(shortReps?.estimatedSecs).toBeGreaterThan((longReps?.estimatedSecs ?? 0) + 50)
  })

  it('does not let a 30-rep session collapse onto its final block', () => {
    const threeRepSession = analyzeIntervalSession(buildSession([
      { distanceM: 280, movingTime: 60, pace: 240, hr: 166 },
      { distanceM: 280, movingTime: 60, pace: 225, hr: 170 },
      { distanceM: 280, movingTime: 60, pace: 210, hr: 174 },
    ], 60), 190)

    const thirtyRepSession = analyzeIntervalSession(buildSession([
      ...Array.from({ length: 10 }, () => ({ distanceM: 280, movingTime: 60, pace: 240, hr: 166 })),
      ...Array.from({ length: 10 }, () => ({ distanceM: 280, movingTime: 60, pace: 225, hr: 170 })),
      ...Array.from({ length: 10 }, () => ({ distanceM: 280, movingTime: 60, pace: 210, hr: 174 })),
    ], 60), 190)

    expect(threeRepSession).not.toBeNull()
    expect(thirtyRepSession).not.toBeNull()
    expect(thirtyRepSession?.estimatedSecs).toBeGreaterThan((threeRepSession?.estimatedSecs ?? 0) + 10)
    expect(thirtyRepSession?.estimatedSecs).toBeGreaterThan(((thirtyRepSession?.allEfforts.at(-1)?.correctedSecs ?? 0) + 20))
  })
})
