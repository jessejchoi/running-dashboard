import { describe, expect, it } from 'vitest'
import { addDays } from '@/lib/calendar'
import {
  computeRhythm,
  countRuns,
  dropOneTier,
  targetFromAverage,
  tierFor,
  weeksToFreeze,
  type RhythmInputs,
  type RhythmRun,
} from '@/lib/rhythm'

const ZONE = 'Asia/Jakarta'
const LAUNCH = '2026-10-05' // a Monday
const PRE = addDays(LAUNCH, -6 * 7) // six weeks of history before launch

function run(day: string, minutes = 40): RhythmRun {
  return { start_date: `${addDays(day, -1)}T23:00:00Z`, start_date_local: `${day}T06:00:00`, moving_time: minutes * 60 }
}

/** `counts[i]` runs in the i-th week from `from`, one per day starting Monday. */
function weeks(from: string, counts: number[]): RhythmRun[] {
  return counts.flatMap((n, i) => Array.from({ length: n }, (_, d) => run(addDays(from, i * 7 + d))))
}

function inputs(runs: RhythmRun[], ledger: RhythmInputs['ledger'] = []): RhythmInputs {
  return { zone: ZONE, runs, ledger }
}

/** Freeze every finished week through the week of `lastWeek`. */
function freezeThrough(input: RhythmInputs, lastWeek: string) {
  return weeksToFreeze(input, LAUNCH, addDays(lastWeek, 9))
}

const at = (day: string) => new Date(`${day}T05:00:00Z`) // midday in Jakarta

describe('weapon tiers', () => {
  it('maps levels to tiers', () => {
    expect([0, 1, 2, 3, 4, 6, 7, 11, 12].map(l => tierFor(l).key)).toEqual([
      'unarmed', 'stick', 'dagger', 'dagger', 'sword', 'sword', 'axe', 'axe', 'legendary',
    ])
  })

  it('drops to the lowest level of the tier below, and Unarmed stays at 0', () => {
    expect([12, 9, 7, 5, 4, 3, 2, 1, 0].map(dropOneTier)).toEqual([7, 4, 4, 2, 2, 1, 1, 0, 0])
  })
})

describe('countRuns', () => {
  it('counts runs of 10+ minutes in the week, including doubles, and ignores short ones', () => {
    // A 13-minute run counts; a 3.5-minute one doesn't.
    const runs = [run(LAUNCH, 40), run(LAUNCH, 13), run(addDays(LAUNCH, 1), 3.5), run(addDays(LAUNCH, 6), 10), run(addDays(LAUNCH, 7), 60)]
    expect(countRuns(runs, LAUNCH, ZONE)).toBe(3)
  })

  it('buckets by the local day the run happened on, not UTC', () => {
    // 23:00 UTC Sunday is Monday morning in Jakarta: it belongs to the new week.
    expect(countRuns([run(addDays(LAUNCH, 7))], addDays(LAUNCH, 7), ZONE)).toBe(1)
    expect(countRuns([run(addDays(LAUNCH, 7))], LAUNCH, ZONE)).toBe(0)
  })
})

describe('targetFromAverage', () => {
  it('rounds to the nearest run normally', () => {
    expect(targetFromAverage(3.8, null)).toBe(4)
    expect(targetFromAverage(3.4, 3)).toBe(3)
    expect(targetFromAverage(4.5, 4)).toBe(5)
  })

  it('rounds up while fading below the previous target', () => {
    expect([3.6, 3.4, 3.2, 3.01, 3.0].map(avg => targetFromAverage(avg, 4))).toEqual([4, 4, 4, 4, 3])
    expect(targetFromAverage(2.6, 3)).toBe(3)
  })

  it('never goes below 1', () => {
    expect(targetFromAverage(0, null)).toBe(1)
    expect(targetFromAverage(0, 3)).toBe(1)
  })
})

describe('the weekly fold', () => {
  it('sets launch-week targets from the 6 weeks before launch, and everyone starts Unarmed', () => {
    const rows = freezeThrough(inputs(weeks(PRE, [4, 4, 4, 4, 4, 3, 4])), LAUNCH)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ week_start: LAUNCH, avg_runs: 3.83, target: 4, runs: 4, state: 'on', level: 1, streak: 1 })
  })

  it('climbs one level per on-week and caps at Legendary', () => {
    const rows = freezeThrough(inputs(weeks(PRE, Array(6 + 14).fill(3))), addDays(LAUNCH, 13 * 7))
    expect(rows.map(r => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 12])
    expect(tierFor(rows[13].level).key).toBe('legendary')
  })

  it('holds the target through a slow fade until the average actually reaches the lower number', () => {
    const rows = freezeThrough(inputs(weeks(PRE, [4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3])), addDays(LAUNCH, 6 * 7))
    expect(rows.map(r => r.target)).toEqual([4, 4, 4, 4, 4, 4, 3])
    expect(rows.map(r => r.state)).toEqual(['short', 'short', 'short', 'short', 'short', 'short', 'on'])
  })

  it('drops a tier on a miss, and redeems the old weapon (without a +1) the next week', () => {
    const rows = freezeThrough(inputs(weeks(PRE, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2])), addDays(LAUNCH, 6 * 7))
    expect(rows.map(r => [r.state, r.level])).toEqual([
      ['on', 1], ['on', 2], ['on', 3], ['on', 4], ['short', 2], ['on', 4], ['on', 5],
    ])
    expect(rows[4].level_before_miss).toBe(4)
    expect(rows[5].redeemed).toBe(true)
  })

  it('makes a second miss in a row stick and drop another tier', () => {
    const rows = freezeThrough(inputs(weeks(PRE, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 2])), addDays(LAUNCH, 6 * 7))
    expect(rows.slice(4).map(r => [r.state, r.level, r.redeemed])).toEqual([
      ['short', 2, false], ['zero', 1, false], ['on', 2, false],
    ])
  })

  it('allows at most one redemption per 4 weeks, so alternating weeks cannot climb', () => {
    const rows = freezeThrough(inputs(weeks(PRE, [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 2, 1, 2, 1, 2])), addDays(LAUNCH, 9 * 7))
    expect(rows.slice(3).map(r => r.level)).toEqual([4, 2, 4, 2, 3, 1, 2])
    expect(rows.filter(r => r.redeemed)).toHaveLength(1)
  })

  it('keeps an Unarmed miss at 0 with nothing to redeem', () => {
    const rows = freezeThrough(inputs(weeks(PRE, [2, 2, 2, 2, 2, 2, 0])), LAUNCH)
    expect(rows[0]).toMatchObject({ state: 'zero', level: 0, level_before_miss: null })
  })
})

describe('freezing', () => {
  const runs = weeks(PRE, [3, 3, 3, 3, 3, 3, 3, 3])

  it('waits two days past Sunday before a week can freeze', () => {
    expect(weeksToFreeze(inputs(runs), LAUNCH, addDays(LAUNCH, 8))).toEqual([]) // Tuesday
    expect(weeksToFreeze(inputs(runs), LAUNCH, addDays(LAUNCH, 9)).map(r => r.week_start)).toEqual([LAUNCH]) // Wednesday
  })

  it('only folds the weeks after the latest frozen row', () => {
    const first = freezeThrough(inputs(runs), LAUNCH)
    const next = weeksToFreeze(inputs(runs, first), LAUNCH, addDays(LAUNCH, 16))
    expect(next.map(r => r.week_start)).toEqual([addDays(LAUNCH, 7)])
    expect(next[0]).toMatchObject({ level: 2, streak: 2 })
  })

  it('gives the same answer whether weeks come from the ledger or are folded live', () => {
    const all = weeks(PRE, [3, 3, 3, 3, 3, 3, 3, 1, 3, 0, 3])
    const today = addDays(LAUNCH, 4 * 7 + 2)
    const frozen = weeksToFreeze(inputs(all), LAUNCH, today)
    expect(computeRhythm(inputs(all, frozen), LAUNCH, at(today))).toEqual({
      ...computeRhythm(inputs(all), LAUNCH, at(today))!,
      unfrozenWeeks: 0,
    })
  })
})

describe('computeRhythm', () => {
  const history = [3, 3, 3, 3, 3, 3]

  it('is off before launch week', () => {
    expect(computeRhythm(inputs(weeks(PRE, history)), LAUNCH, at(addDays(LAUNCH, -1)))).toBeNull()
  })

  it('reports progress, days left and season week', () => {
    const runs = weeks(PRE, [...history, 1])
    const result = computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 2)))!
    expect(result).toMatchObject({
      seasonWeek: 1, target: 3, status: 'building', streak: 0,
      thisWeek: { runs: 1, needed: 2, daysLeft: 5, runDays: [LAUNCH] },
      weapon: { level: 0, nextTier: { key: 'stick' }, weeksToNext: 1 },
    })
  })

  it('flags at-risk when there are fewer days left than runs needed', () => {
    const result = computeRhythm(inputs(weeks(PRE, history)), LAUNCH, at(addDays(LAUNCH, 5)))!
    expect(result.thisWeek).toMatchObject({ runs: 0, needed: 3, daysLeft: 2 })
    expect(result.status).toBe('at_risk')
  })

  it('counts this week toward the streak and weapon once it is on', () => {
    const runs = weeks(PRE, [...history, 3, 3])
    const result = computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 7 + 3)))!
    expect(result).toMatchObject({ status: 'on', streak: 2, weapon: { level: 2, tier: { key: 'dagger' } } })
  })

  it('reports a fade when 2 of the last 3 weeks were missed', () => {
    const runs = weeks(PRE, [...history, 3, 1, 3, 1])
    const result = computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 4 * 7)))!
    expect(result.status).toBe('fade')
    expect(result.fadeWeeks).toBe(1)
  })

  it('offers redemption after a single miss', () => {
    const runs = weeks(PRE, [...history, 3, 3, 3, 3, 1])
    const result = computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 5 * 7)))!
    expect(result.status).toBe('redeem')
    expect(result.weapon).toMatchObject({ redeemAvailable: true, redeemTier: { key: 'sword' }, tier: { key: 'dagger' } })
  })

  it('reports finished weeks that are past grace but not yet frozen', () => {
    const runs = weeks(PRE, [...history, 3, 3, 3])
    expect(computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 16)))!.unfrozenWeeks).toBe(2)
    expect(computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 8)))!.unfrozenWeeks).toBe(0)
  })

  it('does not count today as a day left once they have run, counts doubles once per day, and skips untimed runs', () => {
    const today = addDays(LAUNCH, 2)
    const runs = [...weeks(PRE, history), { ...run(addDays(LAUNCH, 1)), moving_time: null }, run(today), run(today, 20)]
    const result = computeRhythm(inputs(runs), LAUNCH, at(today))!
    expect(result.thisWeek).toEqual({ runs: 2, needed: 1, daysLeft: 4, runDays: [today] })
    expect(result.status).toBe('building')
  })

  it('puts at-risk ahead of fading when the week can no longer be hit', () => {
    const runs = weeks(PRE, [...history, 3, 1, 3, 1])
    const result = computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 4 * 7 + 5)))!
    expect(result.thisWeek).toMatchObject({ runs: 0, needed: 3, daysLeft: 2 })
    expect(result.status).toBe('at_risk')
  })

  it('has no next tier at Legendary and keeps only the last 12 weeks of history', () => {
    const runs = weeks(PRE, Array(6 + 14).fill(3))
    const result = computeRhythm(inputs(runs), LAUNCH, at(addDays(LAUNCH, 14 * 7 + 2)))!
    expect(result.weapon).toMatchObject({ level: 12, tier: { key: 'legendary' }, nextTier: null, weeksToNext: null, redeemAvailable: false, redeemTier: null })
    expect(result.history).toHaveLength(12)
    expect(result.history[0].week).toBe(addDays(LAUNCH, 2 * 7))
    expect(result.streak).toBe(14)
  })
})

describe('level-up and progress to the next level', () => {
  it('flags a level-up only in the week the weapon changes tier', () => {
    // Launch week on target: Unarmed → Stick (a new tier).
    const first = computeRhythm(inputs(weeks(PRE, [3, 3, 3, 3, 3, 3, 3])), LAUNCH, at(addDays(LAUNCH, 5)))!
    expect(first.weapon).toMatchObject({ leveledUp: true, tier: { key: 'stick' }, tierWeeksDone: 0, tierWeeksTotal: 1 })
    // Second on-week: Stick → Dagger.
    const second = computeRhythm(inputs(weeks(PRE, [3, 3, 3, 3, 3, 3, 3, 3])), LAUNCH, at(addDays(LAUNCH, 12)))!
    expect(second.weapon).toMatchObject({ leveledUp: true, tier: { key: 'dagger' }, tierWeeksDone: 0, tierWeeksTotal: 2 })
    // Third on-week stays a Dagger (1 of 2 weeks toward Sword): no level-up.
    const third = computeRhythm(inputs(weeks(PRE, [3, 3, 3, 3, 3, 3, 3, 3, 3])), LAUNCH, at(addDays(LAUNCH, 19)))!
    expect(third.weapon).toMatchObject({ leveledUp: false, tier: { key: 'dagger' }, tierWeeksDone: 1, tierWeeksTotal: 2 })
  })

  it('does not flag a level-up while the target is still open', () => {
    const r = computeRhythm(inputs(weeks(PRE, [3, 3, 3, 3, 3, 3, 1])), LAUNCH, at(addDays(LAUNCH, 2)))!
    expect(r.weapon).toMatchObject({ leveledUp: false, tier: { key: 'unarmed' }, tierWeeksDone: 0, tierWeeksTotal: 1 })
  })
})

describe('weapon sprites', () => {
  it('draws every tier on a clean 16×16 grid in the known colors', async () => {
    const { spriteGrids, weaponPixels } = await import('@/lib/sprites')
    const { TIERS } = await import('@/lib/rhythm')
    for (const tier of TIERS) {
      const grid = spriteGrids()[tier.key]
      expect(grid, tier.key).toHaveLength(16)
      for (const row of grid) expect(row, tier.key).toMatch(/^[.osd]{16}$/)
      expect(weaponPixels(tier.key).length, tier.key).toBeGreaterThan(0)
    }
  })
})
