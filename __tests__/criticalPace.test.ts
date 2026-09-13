import { describe, expect, it } from 'vitest'
import {
  adjustBestEffortToRaceHR,
  adjustBestEffortsToRaceHR,
  buildCapabilityEnvelope,
  fitCriticalPace,
  predictTimeForDistance,
  targetRaceHRForDuration,
  type BestEffortPoint,
} from '@/lib/analysis/criticalPace'

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
  { durationSecs: 2991, paceSecPerKm: 296.95, date: '2026-05-23', activityId: 1, weight: 200 },
  { durationSecs: 3600, paceSecPerKm: 342.4, date: '2026-04-20', activityId: 2 },
  { durationSecs: 5400, paceSecPerKm: 374.6, date: '2026-04-17', activityId: 3 },
]

describe('fitCriticalPace', () => {

  it('scales the capped gain to 40% and never compounds a repeated adjustment', () => {
    const point = { durationSecs: 1800, paceSecPerKm: 360, avgHR: 130, date: '2026-06-01', activityId: 1 }
    // The uncapped gain exceeds 72 s/km; apply the 20% cap first, then retain 40%.
    const once = adjustBestEffortToRaceHR(point, 195)
    expect(once.paceSecPerKm).toBeCloseTo(331.2)
    expect(once.observedPaceSecPerKm).toBe(360)
    expect(once.adjustmentReason).toContain('40%')
    expect(adjustBestEffortToRaceHR(once, 195).paceSecPerKm).toBeCloseTo(331.2)
    expect(adjustBestEffortToRaceHR(point, 195, 1).paceSecPerKm).toBeCloseTo(288)
  })

  it('scales an uncapped gain and keeps sub-three-minute observations unchanged', () => {
    const point = { durationSecs: 1800, paceSecPerKm: 300, avgHR: 175, date: '2026-06-01', activityId: 1 }
    // Target 179.4 bpm: 11 s/km full gain, 4.4 s/km retained.
    expect(adjustBestEffortsToRaceHR([point], 195)[0].paceSecPerKm).toBeCloseTo(295.6)
    expect(adjustBestEffortToRaceHR({ ...point, durationSecs: 120 }, 195).paceSecPerKm).toBe(300)
  })

  it('selects existing fastest points without changing their origin or adding durations', () => {
    const points = [
      { durationSecs: 1200, paceSecPerKm: 280, avgHR: 170, date: '2026-06-01', activityId: 1 },
      { durationSecs: 1200, paceSecPerKm: 300, avgHR: 170, date: '2026-06-02', activityId: 2 },
      { durationSecs: 2700, paceSecPerKm: 360, date: '2026-06-02', activityId: 2 },
      { durationSecs: 5400, paceSecPerKm: 420, date: '2026-06-03', activityId: 3 },
    ]
    const input = adjustBestEffortsToRaceHR(points, 195)
    const envelope = buildCapabilityEnvelope(input)
    expect(envelope).toHaveLength(3)
    for (const p of envelope) expect(input).toContainEqual(p)
    expect(envelope[0].activityId).toBe(1)
    const current = fitCriticalPace(input)!
    const legacy = fitCriticalPace(input, false, 0.15, { legacySyntheticTransfers: true })!
    expect(current.rmse).toBeGreaterThan(legacy.rmse)
  })

  it('adjusts low-HR efforts faster without slowing high-HR or missing-HR efforts', () => {
    const lowHr = adjustBestEffortToRaceHR({
      durationSecs: 1800,
      paceSecPerKm: 360,
      avgHR: 130,
      date: '2026-06-01',
      activityId: 1,
    }, 195)
    const highHr = adjustBestEffortToRaceHR({
      durationSecs: 1800,
      paceSecPerKm: 300,
      avgHR: 185,
      date: '2026-06-01',
      activityId: 2,
    }, 195)
    const missingHr = adjustBestEffortToRaceHR({
      durationSecs: 1800,
      paceSecPerKm: 330,
      date: '2026-06-01',
      activityId: 3,
    }, 195)

    expect(targetRaceHRForDuration(120, 195)).toBeNull()
    expect(lowHr.paceSecPerKm).toBeLessThan(360)
    expect(lowHr.paceSecPerKm).toBeGreaterThanOrEqual(360 * 0.80)
    expect(highHr.paceSecPerKm).toBe(300)
    expect(missingHr.paceSecPerKm).toBe(330)
  })

  it('does not let low-HR slower efforts project past nearby high-HR efforts', () => {
    const adjusted = adjustBestEffortsToRaceHR([
      { durationSecs: 1200, paceSecPerKm: 240, avgHR: 185, date: '2026-06-01', activityId: 1 },
      { durationSecs: 1200, paceSecPerKm: 300, avgHR: 140, date: '2026-06-02', activityId: 2 },
    ], 195)
    const raceLike = adjusted.find(p => p.activityId === 1)!
    const easy = adjusted.find(p => p.activityId === 2)!

    expect(raceLike.paceSecPerKm).toBe(240)
    expect(easy.paceSecPerKm).toBe(300)
    expect(easy.adjustmentReason).toBeUndefined()
  })

  it('keeps observed longer efforts unchanged instead of transferring faster short efforts', () => {
    const envelope = buildCapabilityEnvelope([
      { durationSecs: 1200, paceSecPerKm: 240, date: '2026-06-01', activityId: 1 },
      { durationSecs: 2700, paceSecPerKm: 360, date: '2026-06-02', activityId: 2 },
      { durationSecs: 5400, paceSecPerKm: 420, date: '2026-06-03', activityId: 3 },
    ])
    const source = envelope.find(p => p.durationSecs === 1200)!
    const tenKish = envelope.find(p => p.durationSecs === 2700)!
    const long = envelope.find(p => p.durationSecs === 5400)!

    expect(source.paceSecPerKm).toBe(240)
    expect(tenKish.paceSecPerKm).toBe(360)
    expect(long.paceSecPerKm).toBe(420)
    expect(envelope.every(p => p.adjustmentReason == null)).toBe(true)
  })

  it('retains synthetic transfers only for explicit legacy evaluation', () => {
    const envelope = buildCapabilityEnvelope([
      { durationSecs: 1200, paceSecPerKm: 240, date: '2026-06-01', activityId: 1 },
      { durationSecs: 2700, paceSecPerKm: 360, date: '2026-06-02', activityId: 2 },
      { durationSecs: 14400, paceSecPerKm: 500, date: '2026-06-02', activityId: 2 },
    ], true)
    const tenKish = envelope.find(p => p.durationSecs === 2700)!
    const marathonish = envelope.find(p => p.durationSecs === 14400)!

    expect(marathonish.paceSecPerKm).toBeLessThan(500)
    expect(360 - tenKish.paceSecPerKm).toBeGreaterThan(2 * (500 - marathonish.paceSecPerKm))
  })

  it('does not fit a 20-minute 5K anchor as slower than 20 minutes', () => {
    const fit = fitCriticalPace([
      { durationSecs: 180, paceSecPerKm: 225, date: '2026-06-01', activityId: 1 },
      { durationSecs: 600, paceSecPerKm: 235, date: '2026-06-01', activityId: 1 },
      { durationSecs: 1200, paceSecPerKm: 240, date: '2026-06-01', activityId: 1 },
      { durationSecs: 2700, paceSecPerKm: 360, date: '2026-06-02', activityId: 2 },
      { durationSecs: 5400, paceSecPerKm: 420, date: '2026-06-03', activityId: 3 },
    ])

    expect(fit).not.toBeNull()
    expect(predictTimeForDistance(fit!, 5000)).toBeLessThanOrEqual(20 * 60)
  })

  it('does not let slow non-maximal long-tail points overpower race-like efforts', () => {
    const fit = fitCriticalPace(raceAnchoredTenK)

    expect(fit).not.toBeNull()
    const tenKSecs = predictTimeForDistance(fit!, 10_000)

    expect(tenKSecs).toBeGreaterThan(49 * 60)
    expect(tenKSecs).toBeLessThan(50 * 60 + 15)
    expect(fit!.fitQuality).toBe('high')
  })
})


it('retains hot-weather three-minute efforts after normalization shortens their duration', () => {
  const points = [180, 300, 600].map((secs, i) => ({ durationSecs: secs / 1.02, observedDurationSecs: secs,
    paceSecPerKm: (200 + i * 20) / 1.02, activityId: 1, date: '2026-09-01' }))
  expect(fitCriticalPace(points)?.nPoints).toBe(3)
})
