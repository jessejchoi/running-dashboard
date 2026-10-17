import { describe, expect, it } from 'vitest'
import { addDays } from '@/lib/calendar'
import { foldTimeline, type LedgerRow, type RhythmRun } from '@/lib/rhythm'
import {
  BOSSES,
  bossFor,
  bossHp,
  computeRaid,
  firstRaidIndex,
  isActive,
  raidIndex,
  raidLaunchWeek,
  raidStart,
  raidWeek,
  resolveRaid,
  type RaidMemberInput,
} from '@/lib/raid'

const ZONE = 'Asia/Jakarta'
const LAUNCH = '2026-10-05' // Rhythm launch, a Monday
const RAID = '2026-10-12' // first raid, the Monday after
const PRE = addDays(LAUNCH, -6 * 7)
const at = (day: string) => new Date(`${day}T05:00:00Z`) // midday in Jakarta

function run(day: string, zone = ZONE): RhythmRun {
  const utc = zone === ZONE ? `${addDays(day, -1)}T23:00:00Z` : `${day}T14:00:00Z`
  return { start_date: utc, start_date_local: `${day}T06:00:00`, moving_time: 40 * 60 }
}

/** `counts[i]` runs in the i-th week from PRE, one a day from Monday. */
function runs(counts: number[], zone = ZONE): RhythmRun[] {
  return counts.flatMap((n, i) => Array.from({ length: n }, (_, d) => run(addDays(PRE, i * 7 + d), zone)))
}

interface MemberOptions {
  joined?: string
  zone?: string
  frozenThrough?: string | null
}

/** A member whose weeks are folded from `counts` (per week from PRE) as of `now`. */
function member(id: number, name: string, counts: number[], now: Date, { joined = '2026-01-01', zone = ZONE, frozenThrough = null }: MemberOptions = {}): RaidMemberInput {
  const all = runs(counts, zone)
  const timeline = foldTimeline({ zone, ledger: [], runs: all }, LAUNCH, now)!
  const earlyWeeks = Object.fromEntries(counts.slice(0, 6).map((n, i) => [addDays(PRE, i * 7), n]))
  return { athlete_id: id, name, joinedDay: joined, history: timeline.history, current: timeline.current, frozenThrough, earlyWeeks }
}

// Six pre-launch weeks at 3 runs sets everyone's target to 3.
const BASE = [3, 3, 3, 3, 3, 3]

describe('raid calendar', () => {
  it('starts the week after Rhythm launches, in 4-week raids', () => {
    expect(raidLaunchWeek(LAUNCH)).toBe(RAID)
    expect(raidIndex(LAUNCH, RAID)).toBe(-1)
    expect(raidIndex(RAID, RAID)).toBe(0)
    expect(raidIndex(addDays(RAID, 27), RAID)).toBe(0)
    expect(raidIndex(addDays(RAID, 28), RAID)).toBe(1)
    expect(raidStart(2, RAID)).toBe('2026-12-07')
  })

  it("starts a group's first raid at the first boundary after it was created", () => {
    expect(firstRaidIndex('2026-03-01', RAID)).toBe(0)
    expect(firstRaidIndex(addDays(RAID, -1), RAID)).toBe(0)
    expect(firstRaidIndex(RAID, RAID)).toBe(1) // created on the boundary Monday: its members joined mid-week
    expect(firstRaidIndex(addDays(RAID, 30), RAID)).toBe(2)
  })

  it('rotates through all 6 bosses from the group\'s first raid', () => {
    expect(BOSSES).toHaveLength(6)
    expect(bossFor(3, 3).key).toBe('golem')
    expect(bossFor(8, 3).key).toBe('goblin')
    expect(bossFor(9, 3).key).toBe('golem')
  })
})

describe('bossHp', () => {
  it('is 60% of the damage of everyone hitting all 4 weeks from their starting level', () => {
    // Levels 1,2,3,4 = Stick, Dagger, Dagger, Sword = 8 each: 24 × 0.6.
    expect(bossHp([1, 1, 1])).toBe(14)
    // Levels 10, 11 (Axe 5), then capped Legendary 8 × 2 = 26.
    expect(bossHp([10])).toBe(16)
  })

  it('never drops below the minimum', () => {
    expect(bossHp([])).toBe(4)
  })
})

describe('raidWeek', () => {
  const now = at('2026-10-21') // Wednesday of raid week 2
  const allOn = [...BASE, 3, 3, 3]

  it('lands when half the group hits (rounded up from 1.5) and deals the power each attacker brought into the week', () => {
    const members = [
      member(1, 'Ana', allOn, now),
      member(2, 'Budi', allOn, now),
      member(3, 'Sari', [...BASE, 3, 1, 3], now),
    ]
    const week = raidWeek(members, RAID)
    expect(week.required).toBe(2)
    expect(week.attackers.map(f => f.name)).toEqual(['Ana', 'Budi'])
    expect(week.landed).toBe(true)
    // Launch week took them to level 1, a Stick; this week's level up counts from next week.
    expect(week.damage).toBe(2)
    expect(week.blockers).toEqual([])
    expect(week.eligible.find(f => f.name === 'Sari')).toMatchObject({ state: 'short', dropped: true, redeemNext: true })
  })

  it('fails short of half the group: no damage, no MVP, and the misses are blockers', () => {
    const members = [
      member(1, 'Ana', allOn, now),
      member(2, 'Budi', [...BASE, 3, 0, 3], now),
      member(3, 'Sari', [...BASE, 3, 2, 3], now),
    ]
    const week = raidWeek(members, RAID)
    expect(week.landed).toBe(false)
    expect(week.damage).toBe(0)
    expect(week.mvp).toBeNull()
    expect(week.blockers.map(f => f.name)).toEqual(['Budi', 'Sari'])
  })

  it('needs half the group, rounded, so an even group lands with exactly half', () => {
    const sizes = [1, 2, 3, 4, 5, 6].map(n => raidWeek(Array.from({ length: n }, (_, i) => member(i + 1, `M${i}`, allOn, now)), RAID).required)
    expect(sizes).toEqual([1, 1, 2, 2, 3, 3])
    const week = raidWeek([
      member(1, 'Ana', allOn, now),
      member(2, 'Budi', allOn, now),
      member(3, 'Lee', [...BASE, 3, 0, 3], now),
      member(4, 'Sari', [...BASE, 3, 1, 3], now),
    ], RAID)
    expect(week).toMatchObject({ required: 2, landed: true, damage: 2 })
  })

  it('picks the MVP by power, then streak, then name', () => {
    // Same power and streak: alphabetical.
    expect(raidWeek([member(1, 'Zed', allOn, now), member(2, 'Ana', allOn, now)], RAID).mvp?.name).toBe('Ana')
    // Ana missed launch week, so she's on a Stick while Zed has a Dagger.
    expect(raidWeek([member(1, 'Zed', allOn, now), member(2, 'Ana', [...BASE, 0, 3, 3], now)], RAID).mvp?.name).toBe('Zed')
    // Equal power (both Daggers): the longer streak wins.
    const row = (week_start: string, level: number, streak: number): LedgerRow => ({
      week_start, runs: 3, avg_runs: 3, target: 3, state: 'on', level, level_before_miss: null, redeemed: false, streak, rules_version: 1,
    })
    const manual = (id: number, name: string, rows: LedgerRow[]): RaidMemberInput => ({
      athlete_id: id, name, joinedDay: '2026-01-01', history: rows, current: { ...row('2026-10-19', rows[1].level, 0), runs: 0, state: 'zero' }, frozenThrough: null,
    })
    const tie = raidWeek([manual(1, 'Ana', [row(LAUNCH, 2, 1), row(RAID, 3, 1)]), manual(2, 'Zed', [row(LAUNCH, 2, 5), row(RAID, 3, 6)])], RAID)
    expect(tie.mvp?.name).toBe('Zed')
  })

  it('leaves out dormant members and members who joined mid-week', () => {
    const members = [
      member(1, 'Ana', allOn, now),
      member(2, 'Ghost', [0, 0, 0, 0, 0, 0, 0, 0, 0], now),
      member(3, 'Newbie', allOn, now, { joined: addDays(RAID, 2) }),
    ]
    const week = raidWeek(members, RAID)
    expect(week.eligible.map(f => f.name)).toEqual(['Ana'])
    expect(week.dormant.map(m => m.name)).toEqual(['Ghost'])
    expect(week.landed).toBe(true)
    // The newcomer fights from the next week.
    expect(raidWeek(members, addDays(RAID, 7)).eligible.map(f => f.name)).toEqual(['Ana', 'Newbie'])
  })

  it('treats a member who ran before launch as active, and one silent for 8 weeks as dormant', () => {
    const early = member(1, 'Ana', [3, 0, 0, 0, 0, 0, 0, 0, 0], now)
    expect(isActive(early, RAID)).toBe(true)
    expect(isActive(early, addDays(RAID, 7))).toBe(false)
  })

  it("falls back on launch week's average for pre-launch weeks the loaded runs don't reach", () => {
    const early = { ...member(1, 'Ana', [3, 0, 0, 0, 0, 0, 0, 0, 0], now), earlyWeeks: undefined }
    expect(isActive(early, addDays(RAID, 7))).toBe(true)
  })

  it('does nothing when nobody is eligible', () => {
    const week = raidWeek([member(1, 'Ghost', [0, 0, 0, 0, 0, 0, 0, 0, 0], now)], RAID)
    expect(week.eligible).toHaveLength(0)
    expect(week.landed).toBe(false)
    expect(week.blockers).toEqual([])
  })

  it('keeps the current week open even when everyone is dormant', () => {
    const ghost = member(1, 'Ghost', [0, 0, 0, 0, 0, 0, 0, 0, 0], now)
    // `now` is in the week of Oct 19: still in progress, though nobody can fight.
    expect(raidWeek([ghost], '2026-10-19').open).toBe(true)
    expect(raidWeek([ghost], RAID).open).toBe(false)
  })

  it('projects the open week: locked from attackers so far, possible if everyone hits', () => {
    const mid = at('2026-10-21')
    const week2 = addDays(RAID, 7)
    const members = [
      member(1, 'Ana', [...BASE, 3, 3, 3], mid), // 3 runs by Wednesday: on
      member(2, 'Budi', [...BASE, 3, 3, 1], mid),
      member(3, 'Sari', [...BASE, 3, 3, 0], mid),
    ]
    const week = raidWeek(members, week2)
    expect(week.open).toBe(true)
    expect(week.attackers.map(f => f.name)).toEqual(['Ana'])
    // Everyone enters the week at level 2, a Dagger (power 2).
    expect(week.locked).toBe(2)
    expect(week.possible).toBe(6)
    expect(week.landed).toBe(false)
    expect(week.blockers).toEqual([]) // nobody blocks a week that isn't over
  })

  it('lines up members in other time zones by the Monday their own week starts', () => {
    const la = 'America/Los_Angeles'
    const members = [
      member(1, 'Ana', allOn, now),
      member(2, 'Lee', allOn, now, { zone: la }),
      member(3, 'Sari', [...BASE, 3, 0, 3], now),
    ]
    const week = raidWeek(members, RAID)
    expect(week.attackers.map(f => f.name)).toEqual(['Ana', 'Lee'])
    expect(week.landed).toBe(true)
  })

  it('marks weeks that aren\'t frozen yet as provisional', () => {
    const members = [member(1, 'Ana', allOn, now), member(2, 'Budi', allOn, now, { frozenThrough: RAID })]
    expect(raidWeek(members, RAID).provisional).toBe(true)
    const frozen = [member(1, 'Ana', allOn, now, { frozenThrough: RAID }), member(2, 'Budi', allOn, now, { frozenThrough: RAID })]
    expect(raidWeek(frozen, RAID).provisional).toBe(false)
  })
})

describe('resolveRaid', () => {
  const end = at('2026-11-10') // Tuesday after the first raid

  it('slays the boss and counts the rest as overkill', () => {
    const members = [1, 2, 3].map(id => member(id, `M${id}`, [...BASE, 3, 3, 3, 3, 3, 3], end))
    const raid = resolveRaid(members, 0, 0, RAID, '2026-11-09')
    expect(raid.boss.key).toBe('golem')
    expect(raid.hp).toBe(14)
    // Damage per week: 3 (Stick), 6 (Dagger), 6 (Dagger), 9 (Sword).
    expect(raid.weeks.map(w => w.damage)).toEqual([3, 6, 6, 9])
    expect(raid.status).toBe('slain')
    // 3 + 6 = 9 falls short of 14; week 3's 6 finishes it.
    expect(raid.slainWeek).toBe(3)
    expect(raid.overkill).toBe(10)
  })

  it('fixes HP a week ahead: missing the week before the raid doesn\'t change it', () => {
    const hit = [1, 2].map(id => member(id, `M${id}`, [...BASE, 3, 3], end))
    const missed = [1, 2].map(id => member(id, `M${id}`, [...BASE, 0, 3], end))
    expect(resolveRaid(missed, 0, 0, RAID, '2026-11-09').hp).toBe(resolveRaid(hit, 0, 0, RAID, '2026-11-09').hp)
  })

  it('marks HP provisional until the weeks it rests on are frozen', () => {
    const counts = [...BASE, 3, 3, 3, 3, 3, 3]
    const open = [1, 2].map(id => member(id, `M${id}`, counts, end))
    // Raid 2 starts Nov 9; its HP rests on the weeks through Oct 26.
    expect(resolveRaid(open, 1, 0, RAID, '2026-11-09').hpProvisional).toBe(true)
    const frozen = [1, 2].map(id => member(id, `M${id}`, counts, end, { frozenThrough: '2026-10-26' }))
    expect(resolveRaid(frozen, 1, 0, RAID, '2026-11-09').hpProvisional).toBe(false)
  })

  it('lets the boss escape after 4 weeks', () => {
    const members = [
      member(1, 'Ana', [...BASE, 3, 3, 0, 0, 0, 0], end),
      member(2, 'Budi', [...BASE, 3, 3, 0, 0, 0, 0], end),
    ]
    const raid = resolveRaid(members, 0, 0, RAID, '2026-11-09')
    expect(raid.damage).toBe(2)
    expect(raid.status).toBe('escaped')
    expect(raid.slainWeek).toBeNull()
  })

  it('stays active while weeks remain', () => {
    const members = [member(1, 'Ana', [...BASE, 3, 3, 3], at('2026-10-21'))]
    const raid = resolveRaid(members, 0, 0, RAID, '2026-10-19')
    expect(raid.status).toBe('active')
    expect(raid.weeks).toHaveLength(2)
    expect(raid.weeks[1].open).toBe(true)
    expect(raid.damage).toBe(1)
  })
})

describe('computeRaid', () => {
  const input = (members: RaidMemberInput[], now: Date, createdDay = '2026-03-01') =>
    computeRaid({ members, groupZone: ZONE, createdDay, rhythmLaunchWeek: LAUNCH, now })

  it('shows the countdown before the first raid', () => {
    const now = at('2026-10-07')
    const state = input([member(1, 'Ana', [...BASE, 3], now)], now)
    expect(state.raid).toBeNull()
    expect(state.firstRaidStart).toBe(RAID)
    expect(state.nextBoss.key).toBe('golem')
    // Forecast as if Ana hits launch week (level 1): 1+2+2+3 = 8 × 0.6.
    expect(state.projectedHp).toBe(5)
    expect(state.roster[0]).toMatchObject({ name: 'Ana', on: true, role: 'fighting' })
  })

  it('waits for the next boundary when the group is created mid-raid', () => {
    const now = at('2026-10-21')
    const state = input([member(1, 'Ana', [...BASE, 3, 3, 3], now)], now, '2026-10-14')
    expect(state.raid).toBeNull()
    expect(state.firstRaidStart).toBe('2026-11-09')
  })

  it('reports last week inside the current raid', () => {
    const now = at('2026-10-21')
    const members = [1, 2].map(id => member(id, `M${id}`, [...BASE, 3, 3, 1], now))
    const state = input(members, now)
    expect(state.raid?.number).toBe(1)
    expect(state.lastWeek?.week).toBe(RAID)
    expect(state.lastWeek?.landed).toBe(true)
    expect(state.previous).toBeNull()
    expect(state.daysLeft).toBe(5)
    expect(state.recentWeeks.map(w => w.week)).toEqual([RAID])
  })

  it('announces the next boss and its HP only in the final week of a raid', () => {
    const counts = [...BASE, 3, 3, 3, 3, 3, 3]
    const week3 = at('2026-10-28')
    expect(input([1, 2, 3].map(id => member(id, `M${id}`, counts, week3)), week3).upNext).toBeNull()

    const week4 = at('2026-11-04')
    const state = input([1, 2, 3].map(id => member(id, `M${id}`, counts, week4)), week4)
    // Through Oct 26 everyone is at level 4; hitting Nov 2 too makes 5, so the
    // raid's 4 weeks are Sword, Sword, Axe, Axe = 16 each: 48 × 0.6.
    expect(state.upNext).toEqual({ boss: BOSSES[1], start: '2026-11-09', hp: 29 })
  })

  it('lists finished raids newest first, each with its top damage dealer', () => {
    const now = at('2026-12-09') // raid 3, week 1
    const members = [
      member(1, 'Zed', [...BASE, ...Array(10).fill(3)], now),
      member(2, 'Ana', [...BASE, 3, 3, 3, 3, 3, 0, 3, 3, 3, 3], now),
    ]
    const state = input(members, now)
    expect(state.raid?.number).toBe(3)
    expect(state.history.map(r => r.number)).toEqual([2, 1])
    // Raid 1: both hit every week and deal the same (1+2+2+3 = 8); a tie goes by name.
    expect(state.history[1].mvp).toEqual({ athlete_id: 2, name: 'Ana', damage: 8 })
    // Raid 2: Ana missed a week, so Zed dealt more.
    expect(state.history[0].mvp?.name).toBe('Zed')
  })

  it("doesn't credit damage from failed attacks to the raid MVP", () => {
    const now = at('2026-11-10')
    // Ana hits alone while the others miss: her attacks never land.
    const members = [
      member(1, 'Ana', [...BASE, 3, 3, 3, 3, 3], now),
      member(2, 'Budi', [...BASE, 3, 0, 0, 0, 0], now),
      member(3, 'Sari', [...BASE, 3, 0, 0, 0, 0], now),
    ]
    expect(input(members, now).history[0].mvp).toBeNull()
  })

  it('keeps the finished raid as "previous" for the Monday after it ends, and counts slain bosses', () => {
    const now = at('2026-11-10')
    const members = [1, 2, 3].map(id => member(id, `M${id}`, [...BASE, 3, 3, 3, 3, 3, 3], now))
    const state = input(members, now)
    expect(state.raid?.boss.key).toBe('kraken')
    expect(state.previous?.status).toBe('slain')
    expect(state.lastWeek?.week).toBe('2026-11-02')
    expect(state.bossesSlain).toBe(1)
    expect(state.raidsFought).toBe(1)
    expect(state.nextBoss.key).toBe('lich')
  })

  it('lists the roster with fighters first and dormant members last', () => {
    const now = at('2026-10-21')
    const members = [
      member(1, 'Ghost', [0, 0, 0, 0, 0, 0, 0, 0, 0], now),
      member(2, 'Budi', [...BASE, 3, 3, 0], now),
      member(3, 'Ana', [...BASE, 3, 3, 3], now),
    ]
    const roster = input(members, now).roster
    expect(roster.map(r => [r.name, r.role, r.on])).toEqual([
      ['Ana', 'fighting', true],
      ['Budi', 'fighting', false],
      ['Ghost', 'dormant', false],
    ])
    // Ana's hit this week shows as a level up from next week.
    expect(roster[0]).toMatchObject({ level: 2, tier: { power: 2 } })
    expect(roster[1]).toMatchObject({ level: 2, needed: 3, tier: { power: 2 } })
  })
})

describe('boss sprites', () => {
  it('draws every boss on a clean 16×16 grid in the known colors', async () => {
    const { spriteGrids, bossPixels } = await import('@/lib/sprites')
    for (const boss of BOSSES) {
      const grid = spriteGrids()[boss.key]
      expect(grid, boss.key).toHaveLength(16)
      for (const row of grid) expect(row, boss.key).toMatch(/^[.osd]{16}$/)
      expect(bossPixels(boss.key).length, boss.key).toBeGreaterThan(0)
    }
  })
})
