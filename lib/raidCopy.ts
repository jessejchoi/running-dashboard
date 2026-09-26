import { format, parseISO } from 'date-fns'
import { TIERS, tierIndex, tierNumber, type Tier } from '@/lib/rhythm'
import { RAID_WEEKS, type Boss, type BossKey, type RaidFighter, type RaidState, type RaidWeekResult } from '@/lib/raid'

/*
 * The words for Boss Raid. Shaming is only ever about showing up (never pace,
 * weight or body), never touches dormant members, and every line comes with a
 * way back that's true for that person. Lines are picked deterministically, so
 * the panel and the card always agree.
 */

export const SHAME_SLOTS = 3

/** FNV-1a: a stable pick from a list for the same group, week and runner. */
function pick<T>(options: readonly T[], ...seed: Array<string | number>): T {
  let h = 0x811c9dc5
  for (const ch of seed.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  return options[(h >>> 0) % options.length]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
export const firstName = (name: string) => name.split(' ')[0]
/** The player-facing level, as on the dashboard card: "Level 3 · Dagger". */
export const levelLabel = (tier: Tier) => `Level ${tierNumber(tier)} · ${tier.name}`
export const shortDate = (day: string) => format(parseISO(day), 'EEE MMM d')

const TAUNTS: Record<BossKey, readonly [string, string]> = {
  golem: ["Stay inside where it's cool. I'll wait.", 'You call that sweating? I call it Tuesday.'],
  kraken: ['See you in the jam. Bring snacks.', 'Red light. Red light. Red light.'],
  lich: ['The couch remembers you. Come back.', 'Just one more episode. Then another.'],
  hydra: ['Five more minutes. For all of you. Forever.', "Hit snooze. I'll handle the rest."],
  wyrm: ["Looks like rain. Guess you're staying in.", "I'll be back with the next cloudburst."],
  goblin: ['Too tired? Too busy? Too hot? I accept all excuses.', 'Your excuses polish my crown.'],
}

export function bossTaunt(boss: Boss, groupId: string, raidIndex: number): string {
  return pick(TAUNTS[boss.key], groupId, raidIndex, boss.key)
}

export type ShameKind = 'blocker' | 'drop' | 'miss'

export interface ShameEntry {
  athlete_id: number
  name: string
  kind: ShameKind
  /** An encouraging nudge instead: they were shamed the 2 weeks before. */
  nudge: boolean
  line: string
  wayBack: string
}

export interface ShameList {
  entries: ShameEntry[]
  /** Shamed members past the slots, shown as "+N others". */
  overflow: number
}

function shameKind(week: RaidWeekResult, f: RaidFighter): ShameKind {
  if (!week.landed) return 'blocker'
  return f.dropped ? 'drop' : 'miss'
}

const KIND_ORDER: Record<ShameKind, number> = { blocker: 0, drop: 1, miss: 2 }

/** Who missed a finished week, in slot order: blockers, then tier drops (biggest loss first), then misses. */
function candidates(week: RaidWeekResult): RaidFighter[] {
  return week.eligible
    .filter(f => f.state !== 'on')
    .sort((a, b) =>
      KIND_ORDER[shameKind(week, a)] - KIND_ORDER[shameKind(week, b)]
      || (shameKind(week, a) === 'drop' ? b.tierBefore.power - a.tierBefore.power : 0)
      || a.name.localeCompare(b.name))
}

function shameLine(kind: ShameKind, f: RaidFighter, boss: Boss | null, seed: Array<string | number>): string {
  const name = firstName(f.name)
  const foe = boss?.name ?? 'the boss'
  switch (kind) {
    case 'blocker': return pick([
      `The ${foe} lives because of ${name}.`,
      `${name} held the door open for the ${foe}.`,
      `${name} sat this one out, and the ${foe} laughed.`,
    ], ...seed)
    case 'drop': return pick([
      `${name}'s ${f.tierBefore.name} shattered. Back to ${levelLabel(f.tier)}.`,
      `${name}'s ${f.tierBefore.name} rusted through. Down to ${levelLabel(f.tier)}.`,
    ], ...seed)
    case 'miss': return pick([
      `${name} watched the fight from the bench.`,
      `${name} skipped the battle. The squad carried.`,
    ], ...seed)
  }
}

function nudgeLine(f: RaidFighter, seed: Array<string | number>): string {
  const name = firstName(f.name)
  return pick([
    `${name}'s had a rough few weeks. No roast this time.`,
    `${name}, the squad is saving you a spot in the fight.`,
  ], ...seed)
}

/**
 * The way back, true for this person: win back the dropped weapon when
 * redemption is open, otherwise the climb to the next weapon.
 */
export function wayBack(f: RaidFighter, onThisWeek = false): string {
  if (onThisWeek) return 'Already back on target this week.'
  if (f.redeemNext) return `Hit your target this week to win back your ${f.tierBefore.name} (${levelLabel(f.tierBefore)}).`
  const next = TIERS[tierIndex(f.tier) + 1] ?? null
  if (!next) return 'Hit your target this week to keep your weapon climbing.'
  const weeks = next.min - f.level
  return `Hit your target this week to start climbing again (${next.name} in ${plural(weeks, 'week')}).`
}

/**
 * The shame section for the last of `weeks` (finished raid weeks, oldest
 * first). The earlier weeks only decide who gets a nudge instead.
 */
export function shameList(weeks: RaidWeekResult[], groupId: string, boss: Boss | null, onThisWeek: Set<number> = new Set()): ShameList {
  const last = weeks[weeks.length - 1]
  if (!last) return { entries: [], overflow: 0 }
  const shamedIn = weeks.map(w => new Set(candidates(w).slice(0, SHAME_SLOTS).map(f => f.athlete_id)))
  const before = shamedIn.slice(0, -1)
  const all = candidates(last)
  const entries = all.slice(0, SHAME_SLOTS).map(f => {
    const kind = shameKind(last, f)
    const seed = [groupId, last.week, f.athlete_id]
    const nudge = before.length >= 2 && before.slice(-2).every(s => s.has(f.athlete_id))
    return {
      athlete_id: f.athlete_id,
      name: f.name,
      kind,
      nudge,
      line: nudge ? nudgeLine(f, seed) : shameLine(kind, f, boss, seed),
      wayBack: wayBack(f, onThisWeek.has(f.athlete_id)),
    }
  })
  return { entries, overflow: Math.max(0, all.length - SHAME_SLOTS) }
}

/** Members still short this week who can make it, fewest runs needed first. */
export function stillNeeded(week: RaidWeekResult, daysLeft: number): RaidFighter[] {
  return week.eligible
    .filter(f => f.state !== 'on' && f.needed <= daysLeft)
    .sort((a, b) => a.needed - b.needed || a.name.localeCompare(b.name))
}

/** "Budi (1 run), Sari (2 runs)" */
export function rallyNames(fighters: RaidFighter[]): string {
  return fighters.map(f => `${firstName(f.name)} (${plural(f.needed, 'run')})`).join(', ')
}

export function attackHeadline(week: RaidWeekResult): string {
  return week.landed ? `Attack landed · ${week.damage} dmg` : 'Attack failed'
}

/** One or two short sentences on where the raid stands right now. */
export function situation(state: RaidState): string {
  const { raid, thisWeek, daysLeft } = state
  if (!raid) {
    return `The ${state.nextBoss.name} arrives ${shortDate(state.firstRaidStart)}. Every on-target week until then sharpens your weapon.`
  }
  const boss = raid.boss.name
  const hpLeft = Math.max(0, raid.hp - raid.damage)
  const raidWeek = raid.weeks.length
  if (raid.status === 'slain') {
    return `The ${boss} is down. Overkill round: ${raid.overkill} extra damage so far. Keep your weapons climbing.`
  }
  if (!thisWeek.eligible.length) return 'Nobody is in the fight yet. One run brings you in.'

  const finalWeek = raidWeek === RAID_WEEKS
  const attackers = thisWeek.attackers.length
  if (thisWeek.landed) {
    if (thisWeek.locked >= hpLeft) return `${attackers} of ${thisWeek.eligible.length} on target: this attack finishes the ${boss} on Sunday.`
    return `Attack locked in: ${attackers} of ${thisWeek.eligible.length} on target, ${thisWeek.locked} damage so far. The ${boss} has ${hpLeft} HP left${finalWeek ? ' in its last week' : ''}.`
  }
  const need = thisWeek.majority - attackers
  if (stillNeeded(thisWeek, daysLeft).length < need) {
    return `The attack can't land this week anymore. The ${boss} holds at ${hpLeft} HP${finalWeek ? ' and escapes on Sunday' : ''}.`
  }
  return `The attack needs ${plural(need, 'more runner')} on target, ${plural(daysLeft, 'day')} left. The ${boss} has ${hpLeft} HP${finalWeek ? ', last week to slay it' : ' left'}.`
}

/** A one-line summary for the WhatsApp link when the image can't be shared directly. */
export function shareText(state: RaidState, kind: 'report' | 'rally'): string {
  const raid = kind === 'report' ? state.previous ?? state.raid : state.raid
  if (!raid) return `Boss Raid: the ${state.nextBoss.name} arrives ${shortDate(state.firstRaidStart)}. Hit your weekly runs!`
  if (kind === 'report' && state.lastWeek) {
    const status = raid.status === 'slain' ? ` The ${raid.boss.name} is slain!` : raid.status === 'escaped' ? ` The ${raid.boss.name} escaped.` : ''
    return `Boss Raid battle report: ${attackHeadline(state.lastWeek)}.${status}`
  }
  return `Boss Raid: ${situation(state)}`
}
