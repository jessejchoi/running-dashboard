import { describe, expect, it } from 'vitest'
import { buildBetScoreboard, resolveBetOutcome, type BetActivity, type BetCore } from '@/lib/groupBets'

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

  it('resolves planned-session bets from a same-window run that meets the planned distance', () => {
    const outcome = resolveBetOutcome({
      ...baseBet,
      metric_type: 'planned_session',
      target_value: 12_000,
      window_start: '2026-05-15',
      window_end: '2026-05-15',
    }, [
      run({ id: 1, distance: 10_000, start_date: '2026-05-15T08:00:00.000Z' }),
      run({ id: 2, distance: 13_000, start_date: '2026-05-15T18:00:00.000Z' }),
    ])

    expect(outcome.achieved).toBe(true)
    expect(outcome.bestActivityId).toBe(2)
    expect(outcome.winningSide).toBe('for')
  })

  it('fails planned-session bets when the planned run is missing', () => {
    const outcome = resolveBetOutcome({
      ...baseBet,
      metric_type: 'planned_session',
      target_value: 12_000,
      window_start: '2026-05-15',
      window_end: '2026-05-15',
    }, [
      run({ id: 1, distance: 11_000, start_date: '2026-05-15T08:00:00.000Z' }),
    ])

    expect(outcome.achieved).toBe(false)
    expect(outcome.winningSide).toBe('against')
  })
})

describe('buildBetScoreboard', () => {
  it('aggregates wins, losses, voids, pledge totals, and open exposure', () => {
    const scoreboard = buildBetScoreboard([
      {
        ...baseBet,
        id: 'bet-1',
        creator_athlete_id: 10,
        status: 'won',
        winning_side: 'for',
        pledge_cents: 2000,
      },
      {
        ...baseBet,
        id: 'bet-2',
        creator_athlete_id: 20,
        status: 'void',
        winning_side: null,
        pledge_cents: 1500,
      },
      {
        ...baseBet,
        id: 'bet-3',
        creator_athlete_id: 30,
        status: 'open',
        winning_side: null,
        pledge_cents: 1000,
      },
    ], {
      'bet-1': [
        { athlete_id: 10, side: 'for', pledge_cents: 2000 },
        { athlete_id: 20, side: 'against', pledge_cents: 2000 },
        { athlete_id: 30, side: 'against', pledge_cents: 2000 },
      ],
      'bet-2': [
        { athlete_id: 10, side: 'for', pledge_cents: 1500 },
      ],
      'bet-3': [
        { athlete_id: 20, side: 'for', pledge_cents: 1000 },
      ],
    })

    expect(scoreboard.bestPredictor?.athlete_id).toBe(10)
    expect(scoreboard.biggestUpset).toEqual({ betId: 'bet-1', winnerCount: 1, loserCount: 2 })
    expect(scoreboard.members.find(m => m.athlete_id === 10)?.wins).toBe(1)
    expect(scoreboard.members.find(m => m.athlete_id === 20)?.losses).toBe(1)
    expect(scoreboard.members.find(m => m.athlete_id === 10)?.voids).toBe(1)
    expect(scoreboard.members.find(m => m.athlete_id === 20)?.openExposureCents).toBe(1000)
  })
})
