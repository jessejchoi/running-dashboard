import type { CoachContext } from '@/lib/coachContext'
import { addDays, localDate, weekday, weekStart } from '@/lib/calendar'

/**
 * The Coach edition is built in two layers. This module owns every fact:
 * who ran what, which storylines ("beats") are worth telling, who wins awards,
 * and a templated line for each so the edition reads fine without a model.
 * lib/coachEditionCopy.ts lets the model rewrite those lines in its own voice,
 * but only with numbers and names that appear here.
 */

export type EditionMode = 'recap' | 'midweek'
export type FactValue = string | number
export type Facts = Record<string, FactValue>

export interface EditionRun {
  athlete_id: number
  start_date: string
  distance: number | null
  moving_time?: number | null
  run_type?: string | null
}

export interface MemberWeek {
  athlete_id: number
  name: string
  first_name: string
  km: number
  runs: number
  days_run: number
  longest_km: number
  fastest_pace: string | null
  fastest_pace_secs: number | null
  prev_km: number
  prev_runs: number
  baseline_km: number
  quality_runs_4w: number
  runs_4w: number
  streak_weeks: number
  next_race: { label: string; days: number; gap: string | null } | null
}

export type BeatKey =
  | 'leader'
  | 'spike'
  | 'rivalry'
  | 'race'
  | 'challenge'
  | 'all_hard'
  | 'comeback'
  | 'ghost'

export interface Beat {
  key: BeatKey
  names: string[]
  facts: Facts
  fallback: string
}

export type RollCallState =
  | 'ghost'
  | 'leader'
  | 'spike'
  | 'comeback'
  | 'race'
  | 'up'
  | 'light'
  | 'steady'

export interface RollCallEntry {
  athlete_id: number
  name: string
  state: RollCallState
  facts: Facts
  fallback: string
}

export interface AwardPick {
  athlete_id: number
  athlete_name: string
  award_key: string
  facts: Facts
  evidence: string
  fallback: string
}

export interface EditionPlan {
  mode: EditionMode
  week_start: string
  week_end: string
  as_of: string
  total_km: number
  total_runs: number
  active_members: number
  member_count: number
  prev_total_km: number
  ticker: { km: number; runs: number } | null
  headline: { facts: Facts; names: string[]; fallback: string }
  beats: Beat[]
  mission: { facts: Facts; fallback: string }
  roll_call: RollCallEntry[]
  awards: AwardPick[]
  momentum: 'rising' | 'steady' | 'dipping'
}

const QUALITY_TYPES = new Set(['intervals', 'interval_5k', 'interval_10k', 'threshold', 'tempo'])
const MAX_BEATS = 6
const MAX_ROLL_CALL = 10
const MAX_AWARDS = 4

const round1 = (n: number) => Math.round(n * 10) / 10
const km1 = (n: number) => round1(n).toFixed(1)
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name

function paceLabel(secsPerKm: number) {
  const m = Math.floor(secsPerKm / 60)
  const s = Math.round(secsPerKm % 60)
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`
}

function durationLabel(secs: number) {
  const abs = Math.abs(Math.round(secs))
  return abs >= 60 ? `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}` : `${abs}s`
}

/** Stable per-week variety: the same week always gets the same template. */
function pick<T>(options: T[], seed: string): T {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return options[Math.abs(h) % options.length]
}

function fill(template: string, facts: Facts) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(facts[key] ?? ''))
}

/** Recaps own the start of the week, when the current week has too little to say. */
export function editionWindow(today: string) {
  const current = weekStart(today)
  const day = weekday(today)
  const recap = day >= 1 && day <= 3
  return recap
    ? { mode: 'recap' as const, week_start: addDays(current, -7), week_end: addDays(current, -1), as_of: addDays(current, -1) }
    : { mode: 'midweek' as const, week_start: current, week_end: addDays(current, 6), as_of: today }
}

function summarize(
  member: CoachContext['members'][number],
  runs: EditionRun[],
  window: ReturnType<typeof editionWindow>,
): MemberWeek {
  const dated = runs
    .filter(r => r.athlete_id === member.athlete_id)
    .map(r => ({ ...r, date: localDate(new Date(r.start_date)) }))
  const inRange = (from: string, to: string) => dated.filter(r => r.date >= from && r.date <= to)
  const week = inRange(window.week_start, window.as_of)
  const prev = inRange(addDays(window.week_start, -7), addDays(window.week_start, -1))
  const base = inRange(addDays(window.week_start, -28), addDays(window.week_start, -1))
  const last4w = inRange(addDays(window.as_of, -27), window.as_of)
  const meters = (list: typeof dated) => list.reduce((sum, r) => sum + (r.distance ?? 0), 0)

  const paced = week
    .filter(r => (r.distance ?? 0) >= 5000 && (r.moving_time ?? 0) > 0)
    .map(r => (r.moving_time as number) / ((r.distance as number) / 1000))
  const fastest = paced.length ? Math.min(...paced) : null

  const nextGoal = member.goals
    .filter(g => Number.isFinite(g.days_to_race) && g.days_to_race >= 0)
    .sort((a, b) => a.days_to_race - b.days_to_race)[0]
  const gapSecs = nextGoal?.current_secs != null ? nextGoal.current_secs - nextGoal.target_secs : null

  return {
    athlete_id: member.athlete_id,
    name: member.name,
    first_name: firstName(member.name),
    km: round1(meters(week) / 1000),
    runs: week.length,
    days_run: new Set(week.map(r => r.date)).size,
    longest_km: round1(Math.max(0, ...week.map(r => r.distance ?? 0)) / 1000),
    fastest_pace: fastest ? paceLabel(fastest) : null,
    fastest_pace_secs: fastest,
    prev_km: round1(meters(prev) / 1000),
    prev_runs: prev.length,
    baseline_km: round1(meters(base) / 1000 / 4),
    quality_runs_4w: last4w.filter(r => QUALITY_TYPES.has(r.run_type ?? '')).length,
    runs_4w: last4w.length,
    streak_weeks: member.streak ?? 0,
    next_race: nextGoal
      ? {
          label: nextGoal.label,
          days: nextGoal.days_to_race,
          gap: gapSecs == null ? null : `${durationLabel(gapSecs)} ${gapSecs <= 0 ? 'ahead of' : 'behind'} target`,
        }
      : null,
  }
}

const isSpike = (m: MemberWeek) => m.baseline_km >= 5 && m.km >= m.baseline_km * 1.5
const isAllHard = (m: MemberWeek) => m.quality_runs_4w >= 3 && m.quality_runs_4w / Math.max(1, m.runs_4w) >= 0.6
const isComeback = (m: MemberWeek) => m.prev_runs === 0 && m.runs >= 2

function racePhase(days: number) {
  if (days === 0) return 'race day'
  if (days <= 7) return 'race week'
  if (days <= 14) return 'taper'
  return 'final build'
}

function buildBeats(members: MemberWeek[], ctx: CoachContext, mode: EditionMode, seed: string): Beat[] {
  const beats: Beat[] = []
  const past = mode === 'recap'
  const active = members.filter(m => m.runs > 0).sort((a, b) => b.km - a.km)
  const total = members.reduce((sum, m) => sum + m.km, 0)

  const leader = active[0]
  if (leader) {
    const facts = { name: leader.first_name, km: km1(leader.km), runs: leader.runs, rest_km: km1(total - leader.km) }
    const carrying = active.length >= 3 && leader.km > total - leader.km
    beats.push({
      key: 'leader',
      names: [leader.first_name],
      facts,
      fallback: fill(
        carrying
          ? pick(['{name} ran {km} km. Everyone else combined: {rest_km}. Discuss.', '{name} logged {km} km, more than the rest of the group put together ({rest_km}). Carry fees apply.'], seed + 'lead')
          : pick([`{name} ${past ? 'topped' : 'tops'} the board with {km} km over {runs} runs.`, `{name} ${past ? 'set' : 'is setting'} the pace: {km} km, {runs} runs. The bar is right there.`], seed + 'lead'),
        facts,
      ),
    })
  }

  const spike = members.filter(isSpike).sort((a, b) => b.km / b.baseline_km - a.km / a.baseline_km)[0]
  if (spike) {
    const facts = { name: spike.first_name, km: km1(spike.km), usual_km: km1(spike.baseline_km), multiple: `${(spike.km / spike.baseline_km).toFixed(1)}x` }
    beats.push({
      key: 'spike',
      names: [spike.first_name],
      facts,
      fallback: fill(
        pick([
          '{name} is at {km} km against a usual {usual_km}. Bold. The hamstrings have been notified. Easy week next.',
          '{name} went {multiple} their usual volume ({km} km vs {usual_km}). Ambitious. Next week stays easy or the calves start writing letters.',
        ], seed + 'spike'),
        facts,
      ),
    })
  }

  // Closest adjacent pair on the board, only when the gap is small enough to be a race.
  let rivalry: [MemberWeek, MemberWeek] | null = null
  for (let i = 0; i < active.length - 1; i++) {
    const [a, b] = [active[i], active[i + 1]]
    const gap = a.km - b.km
    if (gap <= Math.max(2, a.km * 0.1) && (!rivalry || gap < rivalry[0].km - rivalry[1].km)) rivalry = [a, b]
  }
  if (rivalry) {
    const [a, b] = rivalry
    const facts = { ahead: a.first_name, behind: b.first_name, gap_km: km1(a.km - b.km), ahead_km: km1(a.km), behind_km: km1(b.km) }
    beats.push({
      key: 'rivalry',
      names: [a.first_name, b.first_name],
      facts,
      fallback: fill(
        past
          ? '{ahead} edged {behind} by {gap_km} km. Revenge is being planned as we speak.'
          : '{ahead} and {behind} are {gap_km} km apart. The weekend long run decides it.',
        facts,
      ),
    })
  }

  const racer = members
    .filter(m => m.next_race && m.next_race.days <= 21)
    .sort((a, b) => a.next_race!.days - b.next_race!.days)[0]
  if (racer?.next_race) {
    const r = racer.next_race
    const facts: Facts = { name: racer.first_name, race: r.label, days: r.days, phase: racePhase(r.days) }
    if (r.gap) facts.estimate = r.gap
    const advice: Record<string, string> = {
      'race day': 'Go get it.',
      'race week': 'Sharpen, sleep, and do nothing heroic.',
      taper: 'This is taper time, not hero time.',
      'final build': 'Last real block. Nail the long run, keep the easy days easy.',
    }
    beats.push({
      key: 'race',
      names: [racer.first_name],
      facts,
      fallback: fill(`{name}: {race} in {days} days${r.gap ? ', estimate {estimate}' : ''}. ${advice[racePhase(r.days)]}`, facts),
    })
  }

  const challenge = ctx.active_challenges?.[0]
  if (challenge) {
    const facts = { challenge: challenge.name, pct: `${challenge.pct}%` }
    beats.push({
      key: 'challenge',
      names: [],
      facts,
      fallback: fill(
        challenge.pct >= 100
          ? '{challenge} is done at {pct}. Somebody frame it.'
          : '{challenge} is sitting at {pct}. Somebody needs to make this less decorative.',
        facts,
      ),
    })
  }

  const hard = members.filter(isAllHard).sort((a, b) => b.quality_runs_4w / b.runs_4w - a.quality_runs_4w / a.runs_4w)[0]
  if (hard) {
    const facts = { name: hard.first_name, quality_runs: hard.quality_runs_4w, total_runs: hard.runs_4w, window: 'last 4 weeks' }
    beats.push({
      key: 'all_hard',
      names: [hard.first_name],
      facts,
      fallback: fill('{quality_runs} of {name}\'s {total_runs} runs in the last 4 weeks were workouts. Easy runs exist, {name}. They\'re allowed.', facts),
    })
  }

  const comeback = members.filter(isComeback).sort((a, b) => b.runs - a.runs)[0]
  if (comeback) {
    const facts = { name: comeback.first_name, runs: comeback.runs, km: km1(comeback.km) }
    beats.push({
      key: 'comeback',
      names: [comeback.first_name],
      facts,
      fallback: fill(`{name} ${past ? 'came' : 'is'} back from a blank week with {runs} runs. Welcome back. We noticed.`, facts),
    })
  }

  const ghosts = members.filter(m => m.runs === 0)
  if (ghosts.length && ghosts.length < members.length) {
    const names = ghosts.slice(0, 3).map(m => m.first_name)
    const facts = { names: names.join(', ') }
    beats.push({
      key: 'ghost',
      names,
      facts,
      fallback: fill(
        names.length === 1
          ? pick([`{names}: 0 runs ${past ? 'last week' : 'so far'}. Strava thinks you moved.`, `{names} ${past ? 'logged' : 'has logged'} 0 runs. We're choosing to believe it's a planned rest week.`], seed + 'ghost')
          : `${past ? 'Zero runs last week' : 'Zero runs so far'} from {names}. The shoes are not going to lace themselves.`,
        facts,
      ),
    })
  }

  return beats.slice(0, MAX_BEATS)
}

function buildRollCall(members: MemberWeek[], leaderName: string | undefined, mode: EditionMode, seed: string): RollCallEntry[] {
  const midweek = mode === 'midweek'
  return [...members]
    .sort((a, b) => b.km - a.km || a.first_name.localeCompare(b.first_name))
    .slice(0, MAX_ROLL_CALL)
    .map(m => {
      const facts: Facts = { name: m.first_name, km: km1(m.km), runs: m.runs, usual_km: km1(m.baseline_km) }
      if (m.longest_km > 0) facts.longest_km = km1(m.longest_km)
      if (m.next_race && m.next_race.days <= 60) {
        facts.race = m.next_race.label
        facts.race_days = m.next_race.days
      }
      const state: RollCallState =
        m.runs === 0 ? 'ghost'
          : m.first_name === leaderName ? 'leader'
            : isSpike(m) ? 'spike'
              : isComeback(m) ? 'comeback'
                : m.next_race && m.next_race.days <= 21 ? 'race'
                  : m.baseline_km > 0 && m.km > m.baseline_km * 1.1 ? 'up'
                    : !midweek && m.baseline_km > 0 && m.km < m.baseline_km * 0.7 ? 'light'
                      : 'steady'
      const templates: Record<RollCallState, string[]> = {
        ghost: ['0 runs. Your shoes filed a missing-person report.', 'Nothing logged. We\'re calling it a very committed rest week.'],
        leader: ['Top of the board. Act like you\'ve been here before.', 'Most on the board, and the bragging rights that come with it.'],
        spike: ['{km} km against a usual {usual_km}. Enjoy it, then take an easy week.'],
        comeback: ['{runs} runs after a blank week. The comeback is on.'],
        race: ['{race} in {race_days} days. Protect the legs.'],
        up: ['{km} km, up on the usual {usual_km}. Quietly building.', 'Above the usual {usual_km}. Nobody asked for this much consistency.'],
        light: ['Lighter week, still on the board. That counts.'],
        steady: midweek
          ? ['{runs} runs in and right on schedule.', 'On the board and in no rush. Respect.']
          : ['Right around the usual {usual_km}. Boringly reliable, which is the whole point.', '{runs} runs, no drama. Coach approves.'],
      }
      return {
        athlete_id: m.athlete_id,
        name: m.first_name,
        state,
        facts,
        fallback: fill(pick(templates[state], seed + m.athlete_id), facts),
      }
    })
}

interface AwardRule {
  key: string
  eligible: (m: MemberWeek) => boolean
  score: (m: MemberWeek) => number
  facts: (m: MemberWeek) => Facts
  evidence: string
  fallback: string
}

const AWARD_RULES: AwardRule[] = [
  {
    key: 'mileage_monster', eligible: m => m.km > 0, score: m => m.km,
    facts: m => ({ km: km1(m.km) }), evidence: '{km} km', fallback: '{km} km. Most on the board.',
  },
  {
    key: 'comeback_kid', eligible: isComeback, score: m => m.runs,
    facts: m => ({ runs: m.runs }), evidence: '{runs} runs after a blank week', fallback: 'Back from a blank week with {runs} runs.',
  },
  {
    key: 'iron_legs', eligible: m => m.longest_km >= 10, score: m => m.longest_km,
    facts: m => ({ longest_km: km1(m.longest_km) }), evidence: '{longest_km} km long run', fallback: 'A {longest_km} km long run. The legs will remember.',
  },
  {
    key: 'speed_demon', eligible: m => m.fastest_pace_secs != null, score: m => -(m.fastest_pace_secs ?? Infinity),
    facts: m => ({ pace: `${m.fastest_pace}/km` }), evidence: '{pace} on a 5 km+ run', fallback: 'Fastest 5 km+ run of the week at {pace}.',
  },
  {
    key: 'consistency_crown', eligible: m => m.days_run >= 3, score: m => m.days_run * 100 + m.km,
    facts: m => ({ days: m.days_run }), evidence: 'ran on {days} days', fallback: 'Showed up on {days} different days. That\'s the whole secret.',
  },
  {
    key: 'dark_horse', eligible: m => m.baseline_km >= 5 && m.km >= m.baseline_km * 1.15 && !isSpike(m), score: m => m.km / m.baseline_km,
    facts: m => ({ km: km1(m.km), usual_km: km1(m.baseline_km) }), evidence: '{km} km vs a usual {usual_km}', fallback: '{km} km against a usual {usual_km}. Nobody saw it coming.',
  },
]

/** One award per person so the trophies spread around; rules run in priority order. */
function pickAwards(members: MemberWeek[]): AwardPick[] {
  const taken = new Set<number>()
  const picks: AwardPick[] = []
  for (const rule of AWARD_RULES) {
    if (picks.length >= MAX_AWARDS) break
    const winner = members
      .filter(m => rule.eligible(m) && !taken.has(m.athlete_id))
      .sort((a, b) => rule.score(b) - rule.score(a))[0]
    if (!winner) continue
    // Ties are not awarded: a shared best can't pick a single winner fairly.
    const tied = members.filter(m => m !== winner && rule.eligible(m) && !taken.has(m.athlete_id) && rule.score(m) === rule.score(winner))
    if (tied.length) continue
    taken.add(winner.athlete_id)
    const facts = rule.facts(winner)
    picks.push({
      athlete_id: winner.athlete_id,
      athlete_name: winner.first_name,
      award_key: rule.key,
      facts,
      evidence: fill(rule.evidence, facts),
      fallback: fill(rule.fallback, facts),
    })
  }
  return picks
}

export function buildEditionPlan(ctx: CoachContext, runs: EditionRun[]): EditionPlan {
  const window = editionWindow(ctx.today)
  const seed = window.week_start
  const members = ctx.members.map(m => summarize(m, runs, window))
  const total_km = round1(members.reduce((sum, m) => sum + m.km, 0))
  const total_runs = members.reduce((sum, m) => sum + m.runs, 0)
  const prev_total_km = round1(members.reduce((sum, m) => sum + m.prev_km, 0))
  const baseline_total = members.reduce((sum, m) => sum + m.baseline_km, 0)
  const active_members = members.filter(m => m.runs > 0).length
  const past = window.mode === 'recap'

  let beats = buildBeats(members, ctx, window.mode, seed)
  const leader = beats.find(b => b.key === 'leader')

  const headlineFacts: Facts = { total_km: km1(total_km), total_runs, active_members, member_count: members.length }
  let headline = { facts: headlineFacts, names: [] as string[], fallback: '' }
  if (!total_runs) {
    headline.fallback = past
      ? '0 runs last week. The group chat is quieter than a taper.'
      : '0 runs so far. Somebody has to go first.'
  } else if (leader && leader.fallback.includes('Discuss')) {
    // A runaway leader is the headline; don't tell the same story twice.
    headline = { facts: { ...headlineFacts, ...leader.facts }, names: leader.names, fallback: leader.fallback }
    beats = beats.filter(b => b !== leader)
  } else {
    headline.fallback = fill(
      past
        ? pick(['{total_km} km, {total_runs} runs, {active_members} of {member_count} of you showed up.', 'Last week: {total_km} km across {total_runs} runs. Here\'s who did what.'], seed + 'head')
        : pick(['{total_km} km and {total_runs} runs so far. The weekend is still undecided.', '{active_members} of {member_count} on the board, {total_km} km so far.'], seed + 'head'),
      headlineFacts,
    )
  }

  let mission: EditionPlan['mission']
  if (past) {
    const facts = { target_km: km1(total_km) }
    mission = { facts, fallback: fill('This week\'s number to beat: {target_km} km as a group. Easy runs count. Hero runs count less than you think.', facts) }
  } else if (total_km < prev_total_km) {
    const facts = { needed_km: km1(prev_total_km - total_km), last_week_km: km1(prev_total_km) }
    mission = { facts, fallback: fill('{needed_km} km as a group by Sunday to beat last week\'s {last_week_km}. Split it up; nobody needs to be a hero.', facts) }
  } else {
    const facts = { last_week_km: km1(prev_total_km) }
    mission = { facts, fallback: fill('Already past last week\'s {last_week_km} km. Everything else is a bonus, so keep the easy runs easy.', facts) }
  }

  const ratio = baseline_total > 0 ? total_km / baseline_total : 1
  const momentum: EditionPlan['momentum'] = past
    ? ratio > 1.15 ? 'rising' : ratio < 0.75 ? 'dipping' : 'steady'
    : ctx.signals.some(s => s.key === 'group_momentum_rising') ? 'rising'
      : ctx.signals.some(s => s.key === 'group_momentum_dipping') ? 'dipping' : 'steady'

  let ticker: EditionPlan['ticker'] = null
  if (past) {
    const thisWeek = ctx.members.reduce((acc, m) => ({ km: acc.km + m.this_week_km, runs: acc.runs + m.run_count_this_week }), { km: 0, runs: 0 })
    ticker = { km: round1(thisWeek.km), runs: thisWeek.runs }
  }

  return {
    ...window,
    total_km,
    total_runs,
    active_members,
    member_count: members.length,
    prev_total_km,
    ticker,
    headline,
    beats,
    mission,
    roll_call: buildRollCall(members, leader?.names[0], window.mode, seed),
    awards: pickAwards(members),
    momentum,
  }
}
