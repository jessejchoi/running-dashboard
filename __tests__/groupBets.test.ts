import { describe, expect, it } from 'vitest'
import { resolveBetOutcome, type BetActivity, type BetCore } from '@/lib/groupBets'

const baseBet: BetCore = {
  target_athlete_id: 10,
  metric_type: 'distance',
  comparator: 'gte',
  target_value: 100_000,
  distance_key: null,
  target_secs: null,
  window_start: '2026-05-11',
  window_end: '2026-05-17',
}

const run = (overrides: Partial<BetActivity>): BetActivity => ({
  id: 1,
  athlete_id: 10,
  start_date: '2026-05-12T10:00:00.000Z',
  distance: 10_000,
  moving_time: 2700,
  matched_distance_key: null,
  ...overrides,
})

describe('resolveBetOutcome', () => {
  it('resolves distance bets from target athlete runs inside the inclusive window', () => {
    const outcome = resolveBetOutcome(baseBet, [
      run({ id: 1, distance: 60_000 }),
      run({ id: 2, distance: 40_000, start_date: '2026-05-17T23:59:59.000Z' }),
      run({ id: 3, distance: 100_000, athlete_id: 99 }),
      run({ id: 4, distance: 10_000, start_date: '2026-05-18T00:00:00.000Z' }),
    ])

    expect(outcome.achieved).toBe(true)
    expect(outcome.currentValue).toBe(100_000)
    expect(outcome.winningSide).toBe('for')
  })

  it('resolves run count bets', () => {
    const outcome = resolveBetOutcome({ ...baseBet, metric_type: 'run_count', target_value: 3 }, [
      run({ id: 1 }),
      run({ id: 2 }),
      run({ id: 3 }),
    ])

    expect(outcome.achieved).toBe(true)
    expect(outcome.evidenceLabel).toBe('3 runs')
  })

  it('resolves longest run bets from the best single activity', () => {
    const outcome = resolveBetOutcome({ ...baseBet, metric_type: 'longest_run', target_value: 21_000 }, [
      run({ id: 1, distance: 18_000 }),
      run({ id: 2, distance: 22_000 }),
    ])

    expect(outcome.achieved).toBe(true)
    expect(outcome.bestActivityId).toBe(2)
  })

  it('treats exact race target time as achieved for lte race-time bets', () => {
    const outcome = resolveBetOutcome({
      ...baseBet,
      metric_type: 'race_time',
      comparator: 'lte',
      target_value: null,
      distance_key: '10k',
      target_secs: 2700,
    }, [
      run({ id: 1, matched_distance_key: '10k', moving_time: 2700 }),
    ])

    expect(outcome.achieved).toBe(true)
    expect(outcome.bestActivityId).toBe(1)
    expect(outcome.winningSide).toBe('for')
  })

  it('uses the fastest matching race inside the window', () => {
    const outcome = resolveBetOutcome({
      ...baseBet,
      metric_type: 'race_time',
      comparator: 'lte',
      target_value: null,
      distance_key: '5k',
      target_secs: 1200,
    }, [
      run({ id: 1, matched_distance_key: '5k', moving_time: 1210 }),
      run({ id: 2, matched_distance_key: '5k', moving_time: 1195 }),
      run({ id: 3, matched_distance_key: '10k', moving_time: 1100 }),
    ])

    expect(outcome.achieved).toBe(true)
    expect(outcome.currentValue).toBe(1195)
    expect(outcome.bestActivityId).toBe(2)
  })

  it('fails race-time bets when no matching race exists inside the window', () => {
    const outcome = resolveBetOutcome({
      ...baseBet,
      metric_type: 'race_time',
      comparator: 'lte',
      target_value: null,
      distance_key: 'hm',
      target_secs: 5400,
    }, [
      run({ id: 1, matched_distance_key: 'hm', moving_time: 5300, start_date: '2026-05-18T00:00:00.000Z' }),
      run({ id: 2, matched_distance_key: '10k', moving_time: 2500 }),
    ])

    expect(outcome.achieved).toBe(false)
    expect(outcome.currentValue).toBe(0)
    expect(outcome.winningSide).toBe('against')
  })
})
