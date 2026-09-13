import { describe, expect, it } from 'vitest'
import { measuredDistanceEffort, performanceCutoff, performanceHeatMultiplier, raceClockEvidence, terrainCostMultiplier } from '@/lib/analysis/performanceEvidence'

const flat = { time: { data: [0, 10, 20, 30, 40] }, distance: { data: [0, 30, 60, 90, 120] }, grade_smooth: { data: [0, 0, 0, 0, 0] } }

describe('performance evidence', () => {
  it('includes six calendar months, including month-end and leap-year boundaries', () => {
    expect(performanceCutoff(new Date('2026-09-13T12:00:00Z'))).toBe('2026-03-13T12:00:00.000Z')
    expect(performanceCutoff(new Date('2024-08-31T12:00:00Z'))).toBe('2024-02-29T12:00:00.000Z')
    expect(performanceCutoff(new Date('2026-09-13T12:00:00Z'), 60)).toBe('2026-07-15T12:00:00.000Z')
  })

  it('removes source heat then applies target heat once, with no unknown-weather credit', () => {
    const time = 6834, heat = performanceHeatMultiplier(22, 21097.5)
    expect(time / heat).toBeLessThan(time)
    expect(time / heat * performanceHeatMultiplier(22, 21097.5)).toBeCloseTo(time)
    expect(time / heat * performanceHeatMultiplier(26, 21097.5)).toBeGreaterThan(time)
    for (const missing of [undefined, null, NaN, Infinity, 999]) expect(performanceHeatMultiplier(missing, 21097.5)).toBe(1)
  })

  it('interpolates exact distance, with pauses included in the elapsed clock', () => {
    expect(measuredDistanceEffort(flat, 50)?.seconds).toBeCloseTo(50 / 3)
    const paused = { time: { data: [0, 10, 110, 120] }, distance: { data: [0, 30, 30, 60] } }
    expect(measuredDistanceEffort(paused, 60)?.seconds).toBe(120)
    expect(measuredDistanceEffort(flat, 121)).toBeNull()
  })

  it('rejects invalid clocks, GPS jumps, and non-monotonic distance', () => {
    for (const stream of [
      { time: { data: [0, 10, 9] }, distance: { data: [0, 30, 60] } },
      { time: { data: [0, 10, 20] }, distance: { data: [0, 300, 600] } },
      { time: { data: [0, 10, 20] }, distance: { data: [0, 30, 29] } },
      { time: { data: [0, 10, NaN] }, distance: { data: [0, 30, 60] } },
    ]) expect(measuredDistanceEffort(stream, 20)).toBeNull()
  })

  it('prefers official results and falls back to full elapsed when streams omit pauses', () => {
    expect(raceClockEvidence(flat, 90, 40, 39, 120)).toMatchObject({ observedSecs: 39, source: 'official_result' })
    expect(raceClockEvidence(flat, 90, 40, null, 120)).toMatchObject({ observedSecs: 30, source: 'measured_distance' })
    expect(raceClockEvidence(flat, 90, 100, null, 120)).toMatchObject({ observedSecs: 100, source: 'full_elapsed', terrainMultiplier: null })
    expect(raceClockEvidence({}, 90, 100, null, 120)).toMatchObject({ observedSecs: 100, source: 'full_elapsed' })
    expect(raceClockEvidence({}, 90, null, null, 120)).toBeNull()
    expect(raceClockEvidence({}, 21097.5, 6000, null, 20000)).toBeNull()
    expect(raceClockEvidence({}, 21097.5, 6000, 5990, 20000)?.source).toBe('official_result')
  })

  it('accounts for both climbs and descents and refuses unsupported terrain', () => {
    expect(terrainCostMultiplier(flat)).toBe(1)
    const rolling = { ...flat, grade_smooth: { data: [0, 2, -2, 2, -2] } }
    expect(terrainCostMultiplier(rolling)).toBeGreaterThan(1)
    const downhill = { ...flat, grade_smooth: { data: [-0.5, -0.5, -0.5, -0.5, -0.5] } }
    expect(terrainCostMultiplier(downhill)).toBeLessThan(1)
    expect(terrainCostMultiplier({ ...flat, grade_smooth: { data: [0, 20, -20, 0, 0] } })).toBeNull()
    expect(terrainCostMultiplier({ ...flat, grade_smooth: undefined })).toBeNull()
  })
})
