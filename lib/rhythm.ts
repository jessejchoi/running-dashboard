import { addDays, localDate, runDay, weekday, weekStart, type DatedRun } from '@/lib/calendar'

/*
 * Rhythm: each runner's weekly target for number of runs, and the weapon that
 * levels up while they keep hitting it. Pure rules only; lib/rhythmData.ts
 * loads the inputs.
 *
 *   launch week                                        this week
 *   │ finished weeks                                   │ open week  │
 *   ├──────────┬──────────┬─────┬──────────────────────┼────────────┤
 *   │ level 0  │ level 1  │ ... │ level 4              │ so far     │
 *   └──────────┴──────────┴─────┴──────────────────────┴────────────┘
 *
 * Everyone starts Unarmed on launch week, and every week is folded from the
 * stored runs on each load: nothing is saved, so the result always matches
 * the runs in the database. Finished weeks arrive as per-week counts
 * (rhythm_week_counts in migration_026); only the week in progress needs its
 * runs. foldWeek() is the only place the weapon rules live.
 */

const WEEK = 7
/** A run counts toward Rhythm when it lasts at least this long. */
export const MIN_RUN_SECS = 10 * 60
const AVERAGE_WEEKS = 6
const REDEEM_COOLDOWN_WEEKS = 4
/** Fading: at least FADE_MISSES misses in the last FADE_WINDOW_WEEKS finished weeks. */
export const FADE_WINDOW_WEEKS = 3
export const FADE_MISSES = 2
/** A finished week counts as settled this many days past its Sunday, leaving time for late uploads. */
export const GRACE_DAYS = 2
/** Runs needed before launch week: the 6 weeks its average covers. */
export const RUN_LOOKBACK_WEEKS = AVERAGE_WEEKS

export const TIERS = [
  { key: 'unarmed', name: 'Unarmed', min: 0, power: 0 },
  { key: 'stick', name: 'Stick', min: 1, power: 1 },
  { key: 'dagger', name: 'Dagger', min: 2, power: 2 },
  { key: 'sword', name: 'Sword', min: 4, power: 3 },
  { key: 'axe', name: 'Axe', min: 7, power: 5 },
  { key: 'legendary', name: 'Legendary', min: 12, power: 8 },
] as const
export type Tier = (typeof TIERS)[number]
/** Levels stop at the top tier (migration_024 checks level between 0 and 12). */
export const LEVEL_CAP = TIERS[TIERS.length - 1].min
export type TierKey = Tier['key']

export type WeekState = 'on' | 'short' | 'zero'
export type RhythmStatus = 'on' | 'at_risk' | 'fade' | 'redeem' | 'building'

export interface RhythmRun extends DatedRun {
  moving_time: number | null
}

export interface LedgerRow {
  week_start: string
  runs: number
  /** Average weekly runs over the 6 weeks before this one. */
  avg_runs: number
  target: number
  state: WeekState
  level: number
  /** Set on a miss that can still be redeemed: the level to restore. */
  level_before_miss: number | null
  redeemed: boolean
  streak: number
}

export interface RhythmInputs {
  zone: string
  /** Qualifying runs per week (keyed by Monday) from RUN_LOOKBACK_WEEKS before launch week on. */
  weeks: Record<string, number>
  /** Individual runs covering at least the week in progress. */
  runs: RhythmRun[]
}

/** A tier's place in TIERS, by key so tiers that went through JSON still match. */
export function tierIndex(tier: Pick<Tier, 'key'>): number {
  return TIERS.findIndex(t => t.key === tier.key)
}

/** The level players see: 1 for Unarmed up to 6 for Legendary. */
export function tierNumber(tier: Pick<Tier, 'key'>): number {
  return tierIndex(tier) + 1
}

export function tierFor(level: number): Tier {
  let tier: Tier = TIERS[0]
  for (const t of TIERS) if (level >= t.min) tier = t
  return tier
}

/** A miss drops the weapon to the lowest level of the tier below. */
export function dropOneTier(level: number): number {
  const index = TIERS.indexOf(tierFor(level))
  return index <= 0 ? 0 : TIERS[index - 1].min
}

export const isMiss = (state: WeekState) => state === 'short' || state === 'zero'

/**
 * The weapon level a runner can win back this week: set when last week was a
 * redeemable miss and no redemption happened in the last 4 weeks.
 */
export function redeemableLevel(history: LedgerRow[]): number | null {
  const prev = history[history.length - 1]
  if (!prev || !isMiss(prev.state) || prev.level_before_miss == null) return null
  return history.slice(-REDEEM_COOLDOWN_WEEKS).some(r => r.redeemed) ? null : prev.level_before_miss
}
const isRhythmRun = (r: RhythmRun) => (r.moving_time ?? 0) >= MIN_RUN_SECS

/** Qualifying runs per week, keyed by Monday: what rhythm_week_counts returns, computed from runs. */
export function weekCounts(runs: RhythmRun[], zone: string): Record<string, number> {
  const weeks: Record<string, number> = {}
  for (const r of runs) {
    if (!isRhythmRun(r)) continue
    const week = weekStart(runDay(r, zone))
    weeks[week] = (weeks[week] ?? 0) + 1
  }
  return weeks
}

export function countRuns(runs: RhythmRun[], week: string, zone: string, upTo = addDays(week, WEEK - 1)): number {
  return runs.filter(r => {
    if (!isRhythmRun(r)) return false
    const day = runDay(r, zone)
    return day >= week && day <= upTo
  }).length
}

/**
 * Round the average to the nearest run, except while fading: when the average
 * is below last week's target, round up, so the target only drops once the
 * average has actually reached the lower number.
 */
export function targetFromAverage(average: number, previousTarget: number | null): number {
  const rounded = previousTarget != null && average < previousTarget ? Math.ceil(average) : Math.round(average)
  return Math.max(1, rounded)
}

type FoldContext = RhythmInputs

/** Average weekly runs over the 6 weeks before `week`. Pre-launch weeks come from the counts. */
function averageBefore(week: string, history: LedgerRow[], ctx: FoldContext): number {
  let total = 0
  for (let i = 1; i <= AVERAGE_WEEKS; i++) {
    const w = addDays(week, -i * WEEK)
    const row = history.find(r => r.week_start === w)
    total += row ? row.runs : ctx.weeks[w] ?? 0
  }
  return Math.round((total / AVERAGE_WEEKS) * 100) / 100
}

/**
 * Fold one week onto the rows before it. A finished week takes its count from
 * `weeks`; the week in progress counts its runs through `upTo`.
 */
export function foldWeek(history: LedgerRow[], week: string, ctx: FoldContext, upTo?: string): LedgerRow {
  const runs = upTo ? countRuns(ctx.runs, week, ctx.zone, upTo) : ctx.weeks[week] ?? 0
  const prev = history[history.length - 1]
  const avg = averageBefore(week, history, ctx)
  const target = targetFromAverage(avg, prev?.target ?? null)
  const state: WeekState = runs >= target ? 'on' : runs > 0 ? 'short' : 'zero'

  const level = prev?.level ?? 0
  const streak = prev?.streak ?? 0
  const base = { week_start: week, runs, avg_runs: avg, target, state }

  if (state === 'on') {
    const pending = redeemableLevel(history)
    if (pending != null) {
      // Redemption buys the old weapon back; it doesn't also grow it.
      return { ...base, level: pending, level_before_miss: null, redeemed: true, streak: streak + 1 }
    }
    return { ...base, level: Math.min(LEVEL_CAP, level + 1), level_before_miss: null, redeemed: false, streak: streak + 1 }
  }
  // A miss. Only a single miss after an on week (or the first week) can be redeemed.
  const dropped = dropOneTier(level)
  const redeemable = (!prev || prev.state === 'on') && dropped < level
  return { ...base, level: dropped, level_before_miss: redeemable ? level : null, redeemed: false, streak: 0 }
}

/** The level a runner reaches if the week after `history` is on: redemption, or one step up. */
export function levelIfOn(history: LedgerRow[]): number {
  const pending = redeemableLevel(history)
  if (pending != null) return pending
  return Math.min(LEVEL_CAP, (history[history.length - 1]?.level ?? 0) + 1)
}

export function currentWeek(zone: string, now = new Date()): string {
  return weekStart(localDate(now, zone))
}

/** The last week that has passed its grace period on `today`. */
export function lastSettledWeek(today: string): string {
  return weekStart(addDays(today, -(WEEK + GRACE_DAYS)))
}

export interface RhythmResult {
  launchWeek: string
  seasonWeek: number
  week: string
  target: number
  avgRuns: number
  thisWeek: { runs: number; needed: number; daysLeft: number; runDays: string[] }
  status: RhythmStatus
  /** Consecutive on-weeks; this week counts once it's on. */
  streak: number
  fadeWeeks: number
  weapon: {
    tier: Tier
    level: number
    nextTier: Tier | null
    weeksToNext: number | null
    /** On-target weeks done and needed within the current tier, toward the next one. */
    tierWeeksDone: number
    tierWeeksTotal: number
    /** Weeks this week's hit adds toward the next tier once the week ends (0 until it's on). */
    tierWeeksPending: number
    /** The level this week's hit brings next Monday, or null until it's on. */
    upcomingLevel: number | null
    /** This week's hit moves the weapon up a tier next Monday. */
    upgradeComing: boolean
    /** The weapon moved up a tier when this week began. */
    leveledUp: boolean
    redeemAvailable: boolean
    redeemTier: Tier | null
  }
  history: Array<{ week: string; state: WeekState; runs: number; target: number }>
}

const weeksBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / (WEEK * 86400000))

export interface RhythmTimeline {
  today: string
  week: string
  /** Every finished week since launch, oldest first. */
  history: LedgerRow[]
  /** This week so far. */
  current: LedgerRow
}

/** Every week since launch folded from the runs, through today; null before launch. */
export function foldTimeline(inputs: RhythmInputs, launchWeek: string, now = new Date()): RhythmTimeline | null {
  const today = localDate(now, inputs.zone)
  const week = weekStart(today)
  if (week < launchWeek) return null
  const history: LedgerRow[] = []
  for (let w = launchWeek; w < week; w = addDays(w, WEEK)) {
    history.push(foldWeek(history, w, inputs))
  }
  return { today, week, history, current: foldWeek(history, week, inputs, today) }
}

export function computeRhythm(inputs: RhythmInputs, launchWeek: string, now = new Date()): RhythmResult | null {
  const timeline = foldTimeline(inputs, launchWeek, now)
  if (!timeline) return null
  const { today, week, history, current } = timeline
  const last = history[history.length - 1]

  // The weapon carried into this week, which is what the raid fights with. This
  // week's hit only upgrades it once the week ends.
  const level = last?.level ?? 0
  const tier = tierFor(level)
  const nextTier = TIERS[TIERS.indexOf(tier) + 1] ?? null
  const upcomingLevel = current.state === 'on' ? current.level : null
  const redeemLevel = current.state === 'on' ? null : redeemableLevel(history)
  const redeemAvailable = redeemLevel != null

  // Fading: 2 of the last 3 finished weeks missed (catches alternating weeks too).
  const fade = history.slice(-FADE_WINDOW_WEEKS).filter(r => isMiss(r.state)).length >= FADE_MISSES
  let fadeWeeks = 0
  for (let i = history.length - 1; i >= 0 && isMiss(history[i].state); i--) fadeWeeks++

  const runDays = inputs.runs
    .filter(isRhythmRun)
    .map(r => runDay(r, inputs.zone))
    .filter(day => day >= week && day <= today)
  const ranToday = runDays.includes(today)
  const daysLeft = Math.round((Date.parse(addDays(week, WEEK - 1)) - Date.parse(today)) / 86400000) + (ranToday ? 0 : 1)
  const needed = Math.max(0, current.target - current.runs)

  const status: RhythmStatus = current.state === 'on' ? 'on'
    : needed > daysLeft ? 'at_risk'
    : fade ? 'fade'
    : redeemAvailable ? 'redeem'
    : 'building'

  return {
    launchWeek,
    seasonWeek: weeksBetween(launchWeek, week) + 1,
    week,
    target: current.target,
    avgRuns: current.avg_runs,
    thisWeek: { runs: current.runs, needed, daysLeft, runDays: Array.from(new Set(runDays)).sort() },
    status,
    streak: current.state === 'on' ? current.streak : last?.streak ?? 0,
    fadeWeeks,
    weapon: {
      tier,
      level,
      nextTier,
      weeksToNext: nextTier ? nextTier.min - level : null,
      tierWeeksDone: nextTier ? level - tier.min : 0,
      tierWeeksTotal: nextTier ? nextTier.min - tier.min : 0,
      tierWeeksPending: nextTier && upcomingLevel != null ? Math.max(0, Math.min(nextTier.min, upcomingLevel) - level) : 0,
      upcomingLevel,
      upgradeComing: upcomingLevel != null && TIERS.indexOf(tierFor(upcomingLevel)) > TIERS.indexOf(tier),
      leveledUp: last != null && TIERS.indexOf(tier) > TIERS.indexOf(tierFor(history[history.length - 2]?.level ?? 0)),
      redeemAvailable,
      redeemTier: redeemLevel != null ? tierFor(redeemLevel) : null,
    },
    history: history.slice(-12).map(r => ({ week: r.week_start, state: r.state, runs: r.runs, target: r.target })),
  }
}

export function isMonday(date: string): boolean {
  return weekday(date) === 1
}
