import { addDays, localDate, weekday, weekStart } from '@/lib/calendar'
import { LEVEL_CAP, isMiss, levelIfOn, redeemableLevel, tierFor, type LedgerRow, type Tier, type WeekState } from '@/lib/rhythm'

/*
 * Boss Raid: the group fights a boss over 4 weeks, powered by everyone's Rhythm.
 * Pure rules only; lib/raidData.ts loads members and lib/raidCopy.ts writes the words.
 *
 *   rhythm launch   raid launch (+1 week)          +4 weeks          +8 weeks
 *   │ hype week     │ raid 0: boss 1 ─────────────│ raid 1: boss 2 ──│ ...
 *
 * Each week, a strict majority of active members must hit their Rhythm target
 * for the attack to land. When it lands, every attacker deals their weapon's
 * power (after this week's upgrade). The boss is slain once landed damage
 * reaches its HP, and escapes if it's still standing after 4 weeks.
 */

export const RAID_WEEKS = 4
/** Boss HP is this share of what the party would deal if everyone hit every week. */
export const HP_FACTOR = 0.6
export const MIN_HP = 4
/** A member with no qualifying run in this many weeks is dormant: no attack, no block. */
export const DORMANT_WEEKS = 8
/** Past raids that count toward "bosses slain" (about a year). */
export const RAID_LOOKBACK = 13

const WEEK = 7

export const BOSSES = [
  { key: 'golem', name: 'Humidity Golem' },
  { key: 'kraken', name: 'Traffic Kraken' },
  { key: 'lich', name: 'Couch Lich' },
  { key: 'hydra', name: 'Snooze Hydra' },
  { key: 'wyrm', name: 'Monsoon Wyrm' },
  { key: 'goblin', name: 'Excuse Goblin King' },
] as const
export type Boss = (typeof BOSSES)[number]
export type BossKey = Boss['key']

const power = (level: number) => tierFor(level).power

/** Raids start the week after Rhythm launches, leaving one hype week with weapons and no boss. */
export function raidLaunchWeek(rhythmLaunchWeek: string): string {
  return addDays(rhythmLaunchWeek, WEEK)
}

/** The global raid a week falls in (negative before the first raid). */
export function raidIndex(week: string, raidLaunch: string): number {
  return Math.floor((Date.parse(week) - Date.parse(raidLaunch)) / (RAID_WEEKS * WEEK * 86400000))
}

export function raidStart(index: number, raidLaunch: string): string {
  return addDays(raidLaunch, index * RAID_WEEKS * WEEK)
}

/**
 * A group's first raid: the first boundary after the day it was created.
 * Groups from before the raid launch start with the very first raid.
 */
export function firstRaidIndex(createdDay: string, raidLaunch: string): number {
  if (createdDay < raidLaunch) return 0
  const days = (Date.parse(createdDay) - Date.parse(raidLaunch)) / 86400000
  return Math.floor(days / (RAID_WEEKS * WEEK)) + 1
}

/** Bosses take turns in order, starting from each group's first raid. */
export function bossFor(index: number, firstIndex: number): Boss {
  return BOSSES[(index - firstIndex) % BOSSES.length]
}

/** Starting HP: HP_FACTOR of what the party, entering the raid at `startLevels`, would deal hitting all 4 weeks. */
export function bossHp(startLevels: number[]): number {
  let max = 0
  for (const s of startLevels) {
    for (let k = 1; k <= RAID_WEEKS; k++) max += power(Math.min(LEVEL_CAP, s + k))
  }
  return Math.max(MIN_HP, Math.round(HP_FACTOR * max))
}

export interface RaidMemberInput {
  athlete_id: number
  name: string
  /** The day they joined the group, in the group's zone. */
  joinedDay: string
  /** Finished weeks, oldest first: frozen rows, then live-folded ones. */
  history: LedgerRow[]
  /** Their week in progress. */
  current: LedgerRow
  /** Latest frozen week, or null when nothing is frozen yet. */
  frozenThrough: string | null
  /** Runs in weeks before launch, where the loaded runs reach back that far. */
  earlyWeeks?: Record<string, number>
}

interface MemberWeek {
  open: boolean
  frozen: boolean
  runs: number
  target: number
  state: WeekState
  levelBefore: number
  level: number
  levelIfOn: number
  streak: number
  redeemNext: boolean
}

/** One member's row for a group week, or null before their history starts. */
function memberWeek(m: RaidMemberInput, week: string): MemberWeek | null {
  const i = m.history.findIndex(r => r.week_start === week)
  if (i >= 0) {
    const row = m.history[i]
    const before = m.history.slice(0, i)
    return {
      open: false,
      frozen: m.frozenThrough != null && week <= m.frozenThrough,
      runs: row.runs,
      target: row.target,
      state: row.state,
      levelBefore: before[before.length - 1]?.level ?? 0,
      level: row.level,
      levelIfOn: levelIfOn(before),
      streak: row.streak,
      redeemNext: redeemableLevel(m.history.slice(0, i + 1)) != null,
    }
  }
  const last = m.history[m.history.length - 1]
  if (week === m.current.week_start) {
    return {
      open: true,
      frozen: false,
      runs: m.current.runs,
      target: m.current.target,
      state: m.current.state,
      levelBefore: last?.level ?? 0,
      level: m.current.state === 'on' ? m.current.level : last?.level ?? 0,
      levelIfOn: levelIfOn(m.history),
      streak: m.current.state === 'on' ? m.current.streak : last?.streak ?? 0,
      redeemNext: false,
    }
  }
  // Their zone hasn't reached this Monday yet: nothing run, nothing changed.
  if (week > m.current.week_start) {
    const level = m.current.state === 'on' ? m.current.level : last?.level ?? 0
    return { open: true, frozen: false, runs: 0, target: m.current.target, state: 'zero', levelBefore: level, level, levelIfOn: Math.min(LEVEL_CAP, level + 1), streak: 0, redeemNext: false }
  }
  return null
}

/** Joined before the week began and ran at least once in the 8 weeks ending with it. */
export function isActive(m: RaidMemberInput, week: string): boolean {
  if (m.joinedDay >= week) return false
  let unknown = false
  for (let i = 0; i < DORMANT_WEEKS; i++) {
    const w = addDays(week, -i * WEEK)
    const runs = memberWeek(m, w)?.runs ?? m.earlyWeeks?.[w]
    if (runs == null) unknown = true
    else if (runs > 0) return true
  }
  // Pre-launch weeks the loaded runs don't reach: launch week's 6-week average stands in.
  return unknown && (m.history[0] ?? m.current).avg_runs > 0
}

export interface RaidFighter {
  athlete_id: number
  name: string
  state: WeekState
  runs: number
  target: number
  /** Runs still needed to hit the target (0 once on). */
  needed: number
  /** Weapon after the week as it stands. */
  tier: Tier
  level: number
  tierBefore: Tier
  /** Damage they deal if the attack lands: power after the upgrade, or 0 while not on. */
  power: number
  /** Damage they would deal by hitting their target. */
  powerIfOn: number
  streak: number
  /** A finished miss that cost a tier. */
  dropped: boolean
  /** A finished miss they can still win back next week. */
  redeemNext: boolean
}

export interface RaidWeekResult {
  week: string
  open: boolean
  eligible: RaidFighter[]
  dormant: Array<{ athlete_id: number; name: string }>
  attackers: RaidFighter[]
  /** Attackers needed to land: a strict majority of the eligible. */
  majority: number
  /** Landed (open week: would land if the week ended now). */
  landed: boolean
  damage: number
  /** Eligible members who missed a finished week the attack failed. */
  blockers: RaidFighter[]
  mvp: RaidFighter | null
  /** Damage locked in by attackers so far. */
  locked: number
  /** Damage if every eligible member hits. */
  possible: number
  /** Some eligible member's row isn't frozen yet. */
  provisional: boolean
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

/** The attack for one group week. */
export function raidWeek(members: RaidMemberInput[], week: string): RaidWeekResult {
  const eligible: RaidFighter[] = []
  const dormant: RaidWeekResult['dormant'] = []
  let open = false, provisional = false
  for (const m of members) {
    const w = memberWeek(m, week)
    if (!w || !isActive(m, week)) {
      if (m.joinedDay < week) dormant.push({ athlete_id: m.athlete_id, name: m.name })
      continue
    }
    open ||= w.open
    provisional ||= !w.open && !w.frozen
    const on = w.state === 'on'
    const tier = tierFor(w.level)
    const tierBefore = tierFor(w.levelBefore)
    eligible.push({
      athlete_id: m.athlete_id,
      name: m.name,
      state: w.state,
      runs: w.runs,
      target: w.target,
      needed: Math.max(0, w.target - w.runs),
      tier,
      level: w.level,
      tierBefore,
      power: on ? tier.power : 0,
      powerIfOn: power(on ? w.level : w.levelIfOn),
      streak: w.streak,
      dropped: !w.open && isMiss(w.state) && tier.power < tierBefore.power,
      redeemNext: !w.open && w.redeemNext,
    })
  }
  eligible.sort(byName)
  dormant.sort(byName)
  const attackers = eligible.filter(f => f.state === 'on')
  const majority = Math.floor(eligible.length / 2) + 1
  const landed = eligible.length > 0 && attackers.length >= majority
  const locked = attackers.reduce((sum, f) => sum + f.power, 0)
  const mvp = landed
    ? [...attackers].sort((a, b) => b.power - a.power || b.streak - a.streak || byName(a, b))[0]
    : null
  return {
    week,
    open,
    eligible,
    dormant,
    attackers,
    majority,
    landed,
    damage: landed ? locked : 0,
    blockers: !open && !landed ? eligible.filter(f => isMiss(f.state)) : [],
    mvp,
    locked,
    possible: eligible.reduce((sum, f) => sum + f.powerIfOn, 0),
    provisional,
  }
}

export type RaidStatus = 'active' | 'slain' | 'escaped'

export interface RaidSummary {
  index: number
  /** This group's raid count, from 1. */
  number: number
  boss: Boss
  start: string
  /** The raid's last Sunday. */
  end: string
  hp: number
  /** HP comes from rows that aren't frozen yet. */
  hpProvisional: boolean
  /** Finished weeks, then the open one when the raid is in progress. */
  weeks: RaidWeekResult[]
  /** Landed damage over finished weeks. */
  damage: number
  status: RaidStatus
  /** The raid week (1–4) the boss fell in. */
  slainWeek: number | null
  overkill: number
}

/**
 * HP for a raid starting on `start`: the max damage over its 4 weeks if every
 * active member hits every target from the week before on. It only depends on
 * weeks that finished before that week began, so it's known (and fixed) a week
 * ahead: missing the week before a raid doesn't change the boss. Provisional
 * while those weeks aren't frozen.
 */
export function raidHp(members: RaidMemberInput[], start: string): { hp: number; provisional: boolean } {
  const before = addDays(start, -WEEK)
  const starters = members.filter(m => isActive(m, start))
  return {
    // levelIfOn: the level after the week before, had they hit it.
    hp: bossHp(starters.map(m => memberWeek(m, before)?.levelIfOn ?? 1)),
    provisional: starters.some(m => {
      const settled = memberWeek(m, addDays(before, -WEEK))
      return settled != null && !settled.frozen
    }),
  }
}

/** A whole raid as of `currentWeek`: weeks from `currentWeek` on haven't finished. */

export function resolveRaid(members: RaidMemberInput[], index: number, firstIndex: number, raidLaunch: string, currentWeek: string): RaidSummary {
  const start = raidStart(index, raidLaunch)
  const { hp, provisional: hpProvisional } = raidHp(members, start)

  const weeks: RaidWeekResult[] = []
  let damage = 0, slainWeek: number | null = null
  for (let i = 0; i < RAID_WEEKS; i++) {
    const week = addDays(start, i * WEEK)
    if (week > currentWeek) break
    const result = raidWeek(members, week)
    weeks.push(result)
    if (week === currentWeek) break
    damage += result.damage
    if (slainWeek == null && damage >= hp) slainWeek = i + 1
  }
  const finished = weeks.filter(w => w.week < currentWeek).length
  return {
    index,
    number: index - firstIndex + 1,
    boss: bossFor(index, firstIndex),
    start,
    end: addDays(start, RAID_WEEKS * WEEK - 1),
    hp,
    hpProvisional,
    weeks,
    damage,
    status: slainWeek != null ? 'slain' : finished === RAID_WEEKS ? 'escaped' : 'active',
    slainWeek,
    overkill: slainWeek != null ? damage - hp : 0,
  }
}

export interface RaidRosterEntry {
  athlete_id: number
  name: string
  /** Their weapon now: upgraded once this week is on. */
  tier: Tier
  level: number
  runs: number
  target: number
  needed: number
  on: boolean
  /** fighting: counts this week; dormant: no runs in 8 weeks; new: joined this week, fights from next week. */
  role: 'fighting' | 'dormant' | 'new'
}

export interface RaidState {
  today: string
  week: string
  /** Days left this week in the group's zone, counting today. */
  daysLeft: number
  firstRaidStart: string
  /** Before the first raid: the incoming boss's HP, already fixed (see raidHp). */
  projectedHp: number | null
  /** The raid in progress, or null before the group's first raid. */
  raid: RaidSummary | null
  /** The raid that just ended, while its final week is still "last week". */
  previous: RaidSummary | null
  thisWeek: RaidWeekResult
  /** Last week's attack, when it was part of a raid. */
  lastWeek: RaidWeekResult | null
  /** Up to 3 finished raid weeks ending with last week, oldest first (for shaming limits). */
  recentWeeks: RaidWeekResult[]
  roster: RaidRosterEntry[]
  bossesSlain: number
  raidsFought: number
  /** The boss after the current one (or the first one, before any raid). */
  nextBoss: Boss
  /** In a raid's final week: the next boss, when it arrives, and its HP (already fixed, see raidHp). */
  upNext: { boss: Boss; start: string; hp: number } | null
}

export interface ComputeRaidInput {
  members: RaidMemberInput[]
  groupZone: string
  /** Day the group was created, in its zone. */
  createdDay: string
  rhythmLaunchWeek: string
  now?: Date
}

export function computeRaid({ members, groupZone, createdDay, rhythmLaunchWeek, now = new Date() }: ComputeRaidInput): RaidState {
  const today = localDate(now, groupZone)
  const week = weekStart(today)
  const launch = raidLaunchWeek(rhythmLaunchWeek)
  const first = firstRaidIndex(createdDay, launch)
  const firstRaidStart = raidStart(first, launch)
  const index = raidIndex(week, launch)
  const inRaid = index >= first && week >= firstRaidStart

  const raid = inRaid ? resolveRaid(members, index, first, launch, week) : null
  const lastWeekDate = addDays(week, -WEEK)
  const lastIndex = raidIndex(lastWeekDate, launch)
  const lastInRaid = lastIndex >= first && lastWeekDate >= firstRaidStart
  const previous = lastInRaid && lastIndex < index ? resolveRaid(members, lastIndex, first, launch, week) : null

  const thisWeek = raid?.weeks.find(w => w.week === week) ?? raidWeek(members, week)
  const findWeek = (w: string) => [...(raid?.weeks ?? []), ...(previous?.weeks ?? [])].find(r => r.week === w)
  const lastWeek = lastInRaid ? findWeek(lastWeekDate) ?? raidWeek(members, lastWeekDate) : null

  const recentWeeks: RaidWeekResult[] = []
  for (let i = 3; i >= 1; i--) {
    const w = addDays(week, -i * WEEK)
    const wi = raidIndex(w, launch)
    if (wi >= first && w >= firstRaidStart) recentWeeks.push(findWeek(w) ?? raidWeek(members, w))
  }

  // Past raids for the trophy count, newest RAID_LOOKBACK only.
  let bossesSlain = 0, raidsFought = 0
  const done = inRaid ? index : first
  for (let i = Math.max(first, done - RAID_LOOKBACK); i < done; i++) {
    raidsFought++
    const past = i === previous?.index ? previous : resolveRaid(members, i, first, launch, week)
    if (past.status === 'slain') bossesSlain++
  }
  if (raid?.status === 'slain') bossesSlain++

  const nextStart = raidStart(index + 1, launch)
  const upNext = raid && raid.weeks.length === RAID_WEEKS
    ? { boss: bossFor(index + 1, first), start: nextStart, hp: raidHp(members, nextStart).hp }
    : null

  const roster = members.map((m): RaidRosterEntry => {
    const fighter = thisWeek.eligible.find(f => f.athlete_id === m.athlete_id)
    const w = memberWeek(m, week)
    const on = w?.state === 'on'
    const level = w ? (on ? w.level : w.levelBefore) : m.history[m.history.length - 1]?.level ?? 0
    return {
      athlete_id: m.athlete_id,
      name: m.name,
      tier: tierFor(level),
      level,
      runs: w?.runs ?? 0,
      target: w?.target ?? 1,
      needed: Math.max(0, (w?.target ?? 1) - (w?.runs ?? 0)),
      on,
      role: fighter ? 'fighting' : m.joinedDay >= week ? 'new' : 'dormant',
    }
  }).sort((a, b) => Number(a.role !== 'fighting') - Number(b.role !== 'fighting') || Number(b.on) - Number(a.on) || b.level - a.level || byName(a, b))

  return {
    today,
    week,
    daysLeft: 7 - ((weekday(today) + 6) % 7),
    firstRaidStart,
    projectedHp: inRaid ? null : raidHp(members, firstRaidStart).hp,
    raid,
    previous,
    thisWeek,
    lastWeek,
    recentWeeks,
    roster,
    bossesSlain,
    raidsFought,
    nextBoss: bossFor(inRaid ? index + 1 : first, first),
    upNext,
  }
}
