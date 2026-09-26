import { addDays, localDate, runDay, weekday, weekStart, type DatedRun } from '@/lib/calendar'

/*
 * Rhythm: each runner's weekly target for number of runs, and the weapon that
 * levels up while they keep hitting it. Pure rules only; lib/rhythmData.ts
 * loads the inputs and lib/rhythmLedger.ts freezes finished weeks.
 *
 *   launch week                                        this week
 *   │ frozen ledger rows (rhythm_weeks, never rewritten)│ open weeks │
 *   ├──────────┬──────────┬─────┬──────────────────────┼────────────┤
 *   │ level 0  │ level 1  │ ... │ level 4              │ folded live│
 *   └──────────┴──────────┴─────┴──────────────────────┴────────────┘
 *
 * Everyone starts Unarmed on launch week. foldWeek() is the only place the
 * weapon rules live; the freezer and the live view both go through it.
 * Bump RHYTHM_RULES_VERSION whenever a rule here changes, then run
 * scripts/rebuild-rhythm.ts so frozen rows are refolded.
 */
export const RHYTHM_RULES_VERSION = 1

const WEEK = 7
/** A run counts toward Rhythm when it lasts at least this long. */
export const MIN_RUN_SECS = 10 * 60
const AVERAGE_WEEKS = 6
const REDEEM_COOLDOWN_WEEKS = 4
/** Fading: at least FADE_MISSES misses in the last FADE_WINDOW_WEEKS finished weeks. */
export const FADE_WINDOW_WEEKS = 3
export const FADE_MISSES = 2
/** Rhythm's first weeks, when everyone is restarting from Unarmed (the leaderboard flame shows from 1 week). */
export const FRESH_START_WEEKS = 4
/** Freezing waits this many days past a week's Sunday for late uploads. */
export const GRACE_DAYS = 2
/** Runs needed before the first open week: the 6 weeks the average covers. */
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
  rules_version: number
}

export interface RhythmInputs {
  zone: string
  /** Frozen rows, oldest first. May start after launch week. */
  ledger: LedgerRow[]
  /** Runs from RUN_LOOKBACK_WEEKS before the first open week onward. */
  runs: RhythmRun[]
}

/** The level players see: 1 for Unarmed up to 6 for Legendary. */
export function tierNumber(tier: Tier): number {
  return TIERS.indexOf(tier) + 1
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

const isMiss = (state: WeekState) => state === 'short' || state === 'zero'

/**
 * The weapon level a runner can win back this week: set when last week was a
 * redeemable miss and no redemption happened in the last 4 weeks.
 */
function redeemableLevel(history: LedgerRow[]): number | null {
  const prev = history[history.length - 1]
  if (!prev || !isMiss(prev.state) || prev.level_before_miss == null) return null
  return history.slice(-REDEEM_COOLDOWN_WEEKS).some(r => r.redeemed) ? null : prev.level_before_miss
}
const isRhythmRun = (r: RhythmRun) => (r.moving_time ?? 0) >= MIN_RUN_SECS

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

interface FoldContext {
  zone: string
  runs: RhythmRun[]
}

/** Average weekly runs over the 6 weeks before `week`. Pre-launch weeks come from runs. */
function averageBefore(week: string, history: LedgerRow[], ctx: FoldContext): number {
  let total = 0
  for (let i = 1; i <= AVERAGE_WEEKS; i++) {
    const w = addDays(week, -i * WEEK)
    const row = history.find(r => r.week_start === w)
    total += row ? row.runs : countRuns(ctx.runs, w, ctx.zone)
  }
  return Math.round((total / AVERAGE_WEEKS) * 100) / 100
}

/**
 * Fold one week onto the rows before it. `upTo` limits counting to a week in
 * progress; a finished week counts through Sunday.
 */
export function foldWeek(history: LedgerRow[], week: string, ctx: FoldContext, upTo?: string): LedgerRow {
  const runs = countRuns(ctx.runs, week, ctx.zone, upTo)
  const prev = history[history.length - 1]
  const avg = averageBefore(week, history, ctx)
  const target = targetFromAverage(avg, prev?.target ?? null)
  const state: WeekState = runs >= target ? 'on' : runs > 0 ? 'short' : 'zero'

  const level = prev?.level ?? 0
  const streak = prev?.streak ?? 0
  const base = { week_start: week, runs, avg_runs: avg, target, state, rules_version: RHYTHM_RULES_VERSION }

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

export function currentWeek(zone: string, now = new Date()): string {
  return weekStart(localDate(now, zone))
}

/** The last week that has passed its grace period on `today`. */
export function lastFreezableWeek(today: string): string {
  return weekStart(addDays(today, -(WEEK + GRACE_DAYS)))
}

/** The first week not yet in the frozen ledger. */
export function firstOpenWeek(ledger: LedgerRow[], launchWeek: string): string {
  const last = ledger[ledger.length - 1]
  return last ? addDays(last.week_start, WEEK) : launchWeek
}

function foldContext(inputs: RhythmInputs): FoldContext {
  return { zone: inputs.zone, runs: inputs.runs }
}

/** Finished weeks after the ledger that are ready to freeze, folded in order. */
export function weeksToFreeze(inputs: RhythmInputs, launchWeek: string, today: string): LedgerRow[] {
  const ctx = foldContext(inputs)
  const history = [...inputs.ledger]
  const rows: LedgerRow[] = []
  const last = lastFreezableWeek(today)
  for (let week = firstOpenWeek(inputs.ledger, launchWeek); week <= last; week = addDays(week, WEEK)) {
    const row = foldWeek(history, week, ctx)
    history.push(row)
    rows.push(row)
  }
  return rows
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
    /** This week's target was hit and it moved the runner up a tier. */
    leveledUp: boolean
    redeemAvailable: boolean
    redeemTier: Tier | null
  }
  history: Array<{ week: string; state: WeekState; runs: number; target: number }>
  /** Finished weeks past their grace period that aren't frozen yet. */
  unfrozenWeeks: number
}

const weeksBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / (WEEK * 86400000))

export function computeRhythm(inputs: RhythmInputs, launchWeek: string, now = new Date()): RhythmResult | null {
  const today = localDate(now, inputs.zone)
  const week = weekStart(today)
  if (week < launchWeek) return null
  const ctx = foldContext(inputs)

  const history = [...inputs.ledger]
  for (let w = firstOpenWeek(inputs.ledger, launchWeek); w < week; w = addDays(w, WEEK)) {
    history.push(foldWeek(history, w, ctx))
  }
  const current = foldWeek(history, week, ctx, today)
  const last = history[history.length - 1]

  // Weapon as of the last finished week, upgraded once this week is on.
  const shown = current.state === 'on' ? current : last
  const level = shown?.level ?? 0
  const tier = tierFor(level)
  const nextTier = TIERS[TIERS.indexOf(tier) + 1] ?? null
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

  const frozenThrough = inputs.ledger[inputs.ledger.length - 1]?.week_start ?? addDays(launchWeek, -WEEK)

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
      leveledUp: current.state === 'on' && TIERS.indexOf(tier) > TIERS.indexOf(tierFor(last?.level ?? 0)),
      redeemAvailable,
      redeemTier: redeemLevel != null ? tierFor(redeemLevel) : null,
    },
    history: history.slice(-12).map(r => ({ week: r.week_start, state: r.state, runs: r.runs, target: r.target })),
    unfrozenWeeks: Math.max(0, weeksBetween(frozenThrough, lastFreezableWeek(today))),
  }
}

export function isMonday(date: string): boolean {
  return weekday(date) === 1
}
