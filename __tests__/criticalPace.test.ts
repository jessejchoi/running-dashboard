import { describe, expect, it } from 'vitest'
import { fitCriticalPace, predictTimeForDistance, type BestEffortPoint } from '@/lib/analysis/criticalPace'

const raceAnchoredTenK: BestEffortPoint[] = [
  { durationSecs: 30, paceSecPerKm: 206.9, date: '2026-05-23', activityId: 1 },
  { durationSecs: 60, paceSecPerKm: 233.9, date: '2026-05-23', activityId: 1 },
  { durationSecs: 90, paceSecPerKm: 249.4, date: '2026-05-23', activityId: 1 },
  { durationSecs: 120, paceSecPerKm: 258.6, date: '2026-05-23', activityId: 1 },
  { durationSecs: 180, paceSecPerKm: 268.1, date: '2026-05-23', activityId: 1 },
  { durationSecs: 300, paceSecPerKm: 271.2, date: '2026-05-23', activityId: 1 },
  { durationSecs: 480, paceSecPerKm: 279.1, date: '2026-05-23', activityId: 1 },
  { durationSecs: 600, paceSecPerKm: 282.5, date: '2026-05-23', activityId: 1 },
  { durationSecs: 900, paceSecPerKm: 286.4, date: '2026-05-23', activityId: 1 },
  { durationSecs: 1200, paceSecPerKm: 287.4, date: '2026-05-23', activityId: 1 },
  { durationSecs: 1800, paceSecPerKm: 289.8, date: '2026-05-23', activityId: 1 },
  { durationSecs: 2700, paceSecPerKm: 293.6, date: '2026-05-23', activityId: 1 },
  { durationSecs: 3600, paceSecPerKm: 342.4, date: '2026-04-20', activityId: 2 },
  { durationSecs: 5400, paceSecPerKm: 374.6, date: '2026-04-17', activityId: 3 },
]

describe('fitCriticalPace', () => {
  it('does not let slow non-maximal long-tail points overpower race-like efforts', () => {
    const fit = fitCriticalPace(raceAnchoredTenK)

    expect(fit).not.toBeNull()
    const tenKSecs = predictTimeForDistance(fit!, 10_000)

    expect(tenKSecs).toBeGreaterThan(49 * 60)
    expect(tenKSecs).toBeLessThan(50 * 60 + 15)
    expect(fit!.fitQuality).toBe('medium')
  })
})
