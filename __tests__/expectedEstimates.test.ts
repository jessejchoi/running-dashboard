import { describe, it, expect } from 'vitest'
import { estimateObserved, type ObservationRun } from '@/lib/analysis/expected'
const asOf = new Date('2026-09-13T00:00:00Z')
const race: ObservationRun = {
  id: 1,
  start_date: '2026-09-01T00:00:00Z',
  distance: 10000,
  moving_time: 2700,
  elapsed_time: 3100,
  is_race: true,
  run_type: 'race',
  run_type_manual: true,
}
describe('observed estimates', () => {
  it('uses full elapsed race time instead of moving time or a fastest segment', () => {
    const e = estimateObserved(
      [race],
      [{ activity_id: 1, duration_secs: 2700, best_pace_sec_per_km: 240 }],
      asOf,
    ).find((e) => e.distanceKey === '10k')!
    expect(e.expectedSecs).toBe(3100)
    expect(e.evidence[0].activityId).toBe(1)
  })
  it('prefers an official finish time when recorded', () =>
    expect(
      estimateObserved([{ ...race, official_result_secs: 3050 }], [], asOf)[1]
        .expectedSecs,
    ).toBe(3050))
  it('excludes future, target-race and excluded observations', () => {
    expect(
      estimateObserved(
        [{ ...race, start_date: asOf.toISOString() }],
        [],
        asOf,
      ).every((e) => e.status === 'insufficient_evidence'),
    ).toBe(true)
    expect(
      estimateObserved([{ ...race, excluded_from_analysis: true }], [], asOf)[1]
        .expectedSecs,
    ).toBeNull()
  })
  it('does not treat ordinary easy runs or name-only race guesses as proven performances', () => {
    const easy = {
      ...race,
      is_race: false,
      run_type: 'easy',
      run_type_manual: false,
    }
    expect(estimateObserved([easy], [], asOf)[1].expectedSecs).toBeNull()
    expect(
      estimateObserved([{ ...race, run_type_manual: false }], [], asOf)[1]
        .expectedSecs,
    ).toBeNull()
  })
  it('does not invent marathon fitness from a 10K race', () =>
    expect(estimateObserved([race], [], asOf)[3].status).toBe(
      'insufficient_evidence',
    ))
  it('makes condition assumptions explicit and range non-probabilistic', () => {
    const e = estimateObserved([race], [], asOf)[1]
    expect(e.explanation).toContain('Weather unavailable')
    expect(e.explanation).toContain('not a calibrated probability')
    expect(e.lowSecs!).toBeLessThan(e.expectedSecs!)
    expect(e.highSecs!).toBeGreaterThan(e.expectedSecs!)
  })
})
