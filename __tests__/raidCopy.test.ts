import { describe, expect, it } from 'vitest'
import { TIERS, type Tier } from '@/lib/rhythm'
import { BOSSES, type RaidFighter, type RaidState, type RaidSummary, type RaidWeekResult } from '@/lib/raid'
import { attackHeadline, bossTaunt, levelLabel, rallyNames, shameList, situation, stillNeeded, wayBack } from '@/lib/raidCopy'

const tier = (key: Tier['key']) => TIERS.find(t => t.key === key)!
const GOLEM = BOSSES[0]
const GROUP = 'group-1'

function fighter(id: number, name: string, overrides: Partial<RaidFighter> = {}): RaidFighter {
  return {
    athlete_id: id, name, state: 'on', runs: 3, target: 3, needed: 0,
    tier: tier('dagger'), level: 2, tierBefore: tier('dagger'), power: 2, powerIfOn: 2, streak: 2,
    dropped: false, redeemNext: false,
    ...overrides,
  }
}
const miss = (id: number, name: string, overrides: Partial<RaidFighter> = {}) =>
  fighter(id, name, { state: 'zero', runs: 0, needed: 3, power: 0, streak: 0, ...overrides })

function week(weekStart: string, eligible: RaidFighter[], overrides: Partial<RaidWeekResult> = {}): RaidWeekResult {
  const attackers = eligible.filter(f => f.state === 'on')
  const required = Math.round(eligible.length / 2)
  const landed = attackers.length >= required
  return {
    week: weekStart, open: false, eligible, dormant: [], attackers, required, landed,
    damage: landed ? attackers.reduce((s, f) => s + f.power, 0) : 0,
    blockers: landed ? [] : eligible.filter(f => f.state !== 'on'),
    mvp: landed ? attackers[0] : null,
    locked: attackers.reduce((s, f) => s + f.power, 0),
    possible: eligible.reduce((s, f) => s + f.powerIfOn, 0),
    provisional: false,
    ...overrides,
  }
}

describe('levelLabel', () => {
  it('reads tiers that came back from JSON (the Raid tab gets them over the API)', () => {
    expect(levelLabel(JSON.parse(JSON.stringify(tier('sword'))))).toBe('Level 4 · Sword')
  })
})

describe('wayBack', () => {
  it('offers the redemption line only when redemption is open', () => {
    const f = miss(1, 'Budi Santoso', { tier: tier('dagger'), level: 2, tierBefore: tier('sword'), dropped: true, redeemNext: true })
    expect(wayBack(f)).toBe('Hit your target this week to win back your Sword (Level 4 · Sword).')
  })

  it('otherwise gives the comeback line with the weeks to the next weapon', () => {
    const f = miss(1, 'Budi', { tier: tier('stick'), level: 1, tierBefore: tier('dagger'), dropped: true, redeemNext: false })
    expect(wayBack(f)).toBe('Hit your target this week to start climbing again (Dagger in 1 week).')
    const unarmed = miss(2, 'Sari', { tier: tier('unarmed'), level: 0, tierBefore: tier('unarmed') })
    expect(wayBack(unarmed)).toBe('Hit your target this week to start climbing again (Stick in 1 week).')
  })

  it('says so when they are already back on target', () => {
    expect(wayBack(miss(1, 'Budi', { redeemNext: true }), true)).toBe('Already back on target this week.')
  })
})

describe('shameList', () => {
  it('orders blockers, then tier drops by biggest loss, then misses, and overflows past 3', () => {
    const landed = week('2026-10-12', [
      fighter(1, 'Ana'), fighter(2, 'Ben'), fighter(3, 'Cy'), fighter(4, 'Dee'), fighter(9, 'Eve'),
      miss(5, 'Zoe', { dropped: true, tierBefore: tier('dagger'), tier: tier('stick'), level: 1 }),
      miss(6, 'Yan', { dropped: true, tierBefore: tier('axe'), tier: tier('sword'), level: 4 }),
      miss(7, 'Bo'),
      miss(8, 'Al'),
    ])
    const list = shameList([landed], GROUP, GOLEM)
    expect(list.entries.map(e => [e.name, e.kind])).toEqual([['Yan', 'drop'], ['Zoe', 'drop'], ['Al', 'miss']])
    expect(list.overflow).toBe(1)
    expect(list.entries[0].line).toMatch(/Yan's Axe (shattered|rusted through)\. (Back|Down) to Level 4 · Sword\./)
  })

  it('names blockers first when the attack failed', () => {
    const failed = week('2026-10-12', [fighter(1, 'Ana'), miss(2, 'Budi'), miss(3, 'Sari')])
    const list = shameList([failed], GROUP, GOLEM)
    expect(list.entries.map(e => e.kind)).toEqual(['blocker', 'blocker'])
    expect(list.entries.every(e => e.wayBack.length > 0)).toBe(true)
  })

  it('never shames dormant members, because they are not eligible', () => {
    const w = week('2026-10-12', [fighter(1, 'Ana')], { dormant: [{ athlete_id: 9, name: 'Ghost' }] })
    expect(shameList([w], GROUP, GOLEM).entries).toEqual([])
  })

  it('switches to a nudge instead of shaming someone a 3rd week in a row', () => {
    const weeks = ['2026-10-12', '2026-10-19', '2026-10-26'].map(d => week(d, [fighter(1, 'Ana'), fighter(2, 'Ben'), miss(3, 'Budi')]))
    const list = shameList(weeks, GROUP, GOLEM)
    expect(list.entries[0]).toMatchObject({ name: 'Budi', nudge: true })
    expect(list.entries[0].line).not.toMatch(/bench|skipped/)
    // Two weeks in a row is still a roast.
    expect(shameList(weeks.slice(1), GROUP, GOLEM).entries[0].nudge).toBe(false)
  })

  it('picks the same line every time for the same group, week and runner', () => {
    const w = week('2026-10-12', [fighter(1, 'Ana'), miss(2, 'Budi')])
    expect(shameList([w], GROUP, GOLEM).entries[0].line).toBe(shameList([w], GROUP, GOLEM).entries[0].line)
  })
})

describe('rally and headlines', () => {
  it('lists who can still make it, fewest runs first', () => {
    const open = week('2026-10-19', [
      fighter(1, 'Ana'),
      miss(2, 'Sari', { needed: 2 }),
      miss(3, 'Budi', { needed: 1 }),
      miss(4, 'Tono', { needed: 5 }),
    ], { open: true })
    expect(rallyNames(stillNeeded(open, 3))).toBe('Budi (1 run), Sari (2 runs)')
  })

  it('reads the attack result', () => {
    expect(attackHeadline(week('2026-10-12', [fighter(1, 'Ana', { power: 11 })]))).toBe('Attack landed · 11 dmg')
    expect(attackHeadline(week('2026-10-12', [miss(1, 'Ana')]))).toBe('Attack failed')
  })

  it('has a taunt for every boss', () => {
    for (const boss of BOSSES) expect(bossTaunt(boss, GROUP, 0)).toBeTruthy()
  })
})

describe('situation', () => {
  const raid = (overrides: Partial<RaidSummary> = {}): RaidSummary => ({
    index: 0, number: 1, boss: GOLEM, start: '2026-10-12', end: '2026-11-08', hp: 20, hpProvisional: false,
    weeks: [], damage: 4, status: 'active', slainWeek: null, overkill: 0, mvp: null, ...overrides,
  })
  const state = (thisWeek: RaidWeekResult, r: RaidSummary | null, daysLeft = 4): RaidState => ({
    today: '2026-10-22', week: '2026-10-19', daysLeft, firstRaidStart: '2026-10-12', projectedHp: null, raid: r, previous: null, history: [],
    thisWeek, lastWeek: null, recentWeeks: [], roster: [], bossesSlain: 0, raidsFought: 0, nextBoss: BOSSES[1], upNext: null,
  })

  it('counts down before the first raid', () => {
    expect(situation({ ...state(week('2026-10-05', []), null), firstRaidStart: '2026-10-12', nextBoss: GOLEM }))
      .toBe('The Humidity Golem arrives Mon Oct 12. Every on-target week until then sharpens your weapon.')
  })

  it('says how many more runners the attack needs', () => {
    const open = week('2026-10-19', [fighter(1, 'Ana'), miss(2, 'Budi', { needed: 1 }), miss(3, 'Sari', { needed: 2 })], { open: true })
    const r = raid({ weeks: [week('2026-10-12', []), open] })
    expect(situation(state(open, r))).toBe('The attack needs 1 more runner on target, 4 days left. The Humidity Golem has 16 HP left.')
  })

  it("admits when the attack can't land anymore", () => {
    const open = week('2026-10-19', [fighter(1, 'Ana'), miss(2, 'Budi', { needed: 3 }), miss(3, 'Sari', { needed: 3 })], { open: true })
    expect(situation(state(open, raid({ weeks: [open] }), 2))).toMatch(/can't land this week anymore/)
  })

  it('calls the finishing blow and the overkill round', () => {
    const open = week('2026-10-19', [fighter(1, 'Ana', { power: 20 }), fighter(2, 'Ben', { power: 0 })], { open: true })
    expect(situation(state(open, raid({ weeks: [open] })))).toMatch(/finishes the Humidity Golem/)
    expect(situation(state(open, raid({ status: 'slain', overkill: 7 })))).toMatch(/Overkill round: 7 extra damage/)
  })
})
