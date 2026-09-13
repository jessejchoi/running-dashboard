import { describe, expect, it } from 'vitest'
import { project } from '@/lib/analysis/projector'
import type { CPFitResult } from '@/lib/analysis/criticalPace'
import type { AthleteFeatures } from '@/lib/analysis/features'

const fit: CPFitResult = {
  cv: 3.7,
  dPrime: 180,
  vmax: 7.2,
  rmse: 0.08,
  nPoints: 8,
  durationRangeSecs: [60, 1800],
  fitQuality: 'high',
}

const features: AthleteFeatures = {
  aerobic: {
    points: [
      { date: '2026-06-01', activityId: 1, paceAt150SecPerKm: 320, durationMins: 45, avgHR: 150, rawPaceSecPerKm: 330 },
      { date: '2026-06-04', activityId: 2, paceAt150SecPerKm: 318, durationMins: 42, avgHR: 149, rawPaceSecPerKm: 328 },
      { date: '2026-06-08', activityId: 3, paceAt150SecPerKm: 316, durationMins: 50, avgHR: 151, rawPaceSecPerKm: 326 },
      { date: '2026-06-12', activityId: 4, paceAt150SecPerKm: 314, durationMins: 48, avgHR: 150, rawPaceSecPerKm: 324 },
    ],
    currentPaceSecPerKm: 316,
    trendSecPerKmPerWeek: -2,
  },
  endurance: {
    longestRunKm: 28,
    longestRunDate: '2026-06-09',
    weeklyVolumeKm: 45,
    weeklyDurationMins: 250,
    runsInWindow: 12,
  },
  form: {
    acuteLoad: 360,
    chronicLoad: 900,
    acuteChronicRatio: 1.6,
    status: 'fatigued',
  },
  drift: {
    avgDriftPct: 3,
    avgExcessDriftPct: 1.5,
    sampleSize: 4,
  },
  windowDays: 60,
}

describe('project', () => {
  it('keeps ideal/current comparison limited to conditions', () => {
    const [fiveK] = project({
      fit,
      features,
      currentConditions: { wbgtApproxC: 25 },
      raceConditions: { wbgtApproxC: 20 },
    })

    const expectedIdeal = fiveK.baseSecs
      * fiveK.modifiers.enduranceMultiplier
      * fiveK.modifiers.driftMultiplier
      * fiveK.modifiers.formMultiplier

    expect(fiveK.idealSecs).toBeCloseTo(expectedIdeal, 6)
    expect(fiveK.todaySecs).toBeCloseTo(fiveK.idealSecs * fiveK.modifiers.heatMultiplier, 6)
    expect(fiveK.raceDaySecs).toBeGreaterThan(fiveK.idealSecs)
    expect(fiveK.todaySecs).toBeGreaterThan(fiveK.idealSecs)
  })

  it('does not apply cardiac-drift durability penalties to 5K or 10K', () => {
    const projections = project({
      fit,
      features: {
        ...features,
        drift: { avgDriftPct: 10, avgExcessDriftPct: 6, sampleSize: 6 },
      },
      currentConditions: null,
    })
    const fiveK = projections.find(p => p.distanceKey === '5k')!
    const tenK = projections.find(p => p.distanceKey === '10k')!
    const half = projections.find(p => p.distanceKey === 'hm')!

    expect(fiveK.modifiers.driftMultiplier).toBe(1)
    expect(tenK.modifiers.driftMultiplier).toBe(1)
    expect(half.modifiers.driftMultiplier).toBeGreaterThan(1)
  })

  it('does not make current conditions slower than a same-condition direct race anchor', () => {
    const projections = project({
      fit,
      features,
      currentConditions: { wbgtApproxC: 25 },
      raceAnchors: [{
        distanceKey: '10k',
        observedSecs: 49 * 60 + 21,
        conditions: { wbgtApproxC: 25 },
      }],
    })
    const tenK = projections.find(p => p.distanceKey === '10k')!

    expect(tenK.todaySecs).toBeLessThanOrEqual(49 * 60 + 21)
    expect(tenK.idealSecs).toBeLessThan(tenK.todaySecs)
  })
})

describe('demonstrated performances after all modifiers', () => {
  const slowFit = { ...fit, cv: 2.8, dPrime: 100 }
  it('keeps same-weather estimates within the observed race despite fatigue/endurance/drift penalties', () => {
    const half = project({ fit: slowFit, features, currentConditions: { wbgtApproxC: 22 },
      raceAnchors: [{ distanceKey: 'hm', observedSecs: 6834, conditions: { wbgtApproxC: 22 }, terrainMultiplier: 1.018 }] }).find(p => p.distanceKey === 'hm')!
    expect(half.todaySecs).toBeCloseTo(6834 / 1.018)
    expect(half.idealSecs).toBeCloseTo(6834 / 1.021 / 1.018)
  })
  it('selects the strongest normalized evidence instead of whichever raw time is faster', () => {
    const half = project({ fit: slowFit, features, raceAnchors: [
      { distanceKey: 'hm', observedSecs: 6800, conditions: { wbgtApproxC: 15 }, activityId: 1 },
      { distanceKey: 'hm', observedSecs: 6834, conditions: { wbgtApproxC: 25 }, activityId: 2 },
    ] }).find(p => p.distanceKey === 'hm')!
    expect(half.supportingRace?.activityId).toBe(2)
    expect(half.idealSecs).toBeCloseTo(6834 / 1.03)
  })
  it('does not mistake a downhill advantage for a hill penalty', () => {
    const half = project({ fit: slowFit, features, raceAnchors: [
      { distanceKey: 'hm', observedSecs: 6834, terrainMultiplier: 0.98 },
    ] }).find(p => p.distanceKey === 'hm')!
    expect(half.idealSecs).toBeCloseTo(6834 / 0.98)
  })
})
