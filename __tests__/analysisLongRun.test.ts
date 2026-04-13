import { describe, expect, it } from 'vitest'
import { analyzeLongRun } from '@/lib/analysis'

function split(paceSecPerKm: number, minutes: number, hr: number) {
  return {
    average_speed: 1000 / paceSecPerKm,
    average_heartrate: hr,
    moving_time: minutes * 60,
    elapsed_time: minutes * 60,
    distance: (minutes * 60 / paceSecPerKm) * 1000,
  }
}

function buildLongRun(blockMinutes: number, leadMinutes: number = 90) {
  const preBlock = Array.from({ length: leadMinutes / 10 }, () => split(360, 10, 145))
  const fastBlock = Array.from({ length: blockMinutes / 10 }, () => split(320, 10, 172))
  const cooldown = [split(370, 10, 150)]
  const splits = [...preBlock, ...fastBlock, ...cooldown]

  const totalSeconds = splits.reduce((sum, lap) => sum + lap.moving_time, 0)
  const totalDistance = splits.reduce((sum, lap) => sum + lap.distance, 0)

  return {
    id: 1,
    name: 'Long progression',
    start_date: '2026-04-13T00:00:00Z',
    distance: totalDistance,
    moving_time: totalSeconds,
    average_speed: totalDistance / totalSeconds,
    average_heartrate: 152,
    splits,
    run_type: 'long_progressive',
  }
}

describe('analyzeLongRun fast block fatigue credit', () => {
  it('gives deep long-run fast blocks more fatigue credit than before', () => {
    const analysis = analyzeLongRun(buildLongRun(20))

    expect(analysis).not.toBeNull()
    expect(analysis?.fastBlock).toBeDefined()
    expect(analysis?.fatigueCredit).toBeGreaterThan(22)
  })

  it('gives longer fast blocks more credit than shorter ones at the same depth', () => {
    const shortBlock = analyzeLongRun(buildLongRun(10))
    const longBlock = analyzeLongRun(buildLongRun(20))

    expect(shortBlock).not.toBeNull()
    expect(longBlock).not.toBeNull()
    expect(longBlock?.fatigueCredit).toBeGreaterThan(shortBlock?.fatigueCredit ?? 0)
  })
})
