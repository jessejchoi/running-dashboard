import {
  addDays,
  localDate,
  validDate,
  validTimezone,
  weekday,
} from '@/lib/calendar'
import { type SessionConfig } from '@/components/PlanSessionModal'
import {
  type UserGoal,
  primaryRace,
  formatGoalTime,
  distanceKm,
} from '@/lib/goals'
export interface TrainingPreferences {
  days: number[]
  maxMinutes: number
  longRunDay: number
  timezone: string
  easyOnly: boolean
  startingWeeklyKm: number
  autoAdapt: boolean
  primaryGoalId?: string | null
  maxWeeklyKm?: number | null
  avoidConsecutiveDays?: boolean
  constraints?: string
}
export interface PlanSession {
  id: string
  athlete_id?: number
  plan_date: string
  session_index: number
  session_type: string
  description: string | null
  target_distance_meters: number | null
  config: SessionConfig | null
  source: 'manual' | 'coach' | 'shared'
  locked: boolean
  status: 'planned' | 'completed' | 'skipped'
  activity_id: number | null
  shared_run_id?: string | null
  shared_run_version?: number | null
  matching_disabled?: boolean
  event_changed?: boolean
}
export function validatePreferences(b: any): TrainingPreferences {
  if (
    !b ||
    !Array.isArray(b.days) ||
    !b.days.length ||
    b.days.length > 7 ||
    !b.days.every((d: any) => Number.isInteger(d) && d >= 0 && d <= 6) ||
    new Set(b.days).size !== b.days.length ||
    !Number.isInteger(b.maxMinutes) ||
    b.maxMinutes < 15 ||
    b.maxMinutes > 180 ||
    !b.days.includes(b.longRunDay) ||
    !validTimezone(b.timezone) ||
    typeof b.easyOnly !== 'boolean' ||
    typeof b.autoAdapt !== 'boolean' ||
    !Number.isFinite(b.startingWeeklyKm) ||
    b.startingWeeklyKm < 0 ||
    b.startingWeeklyKm > 150
  )
    throw new Error(
      'Choose available days, a long-run day, a 15–180 minute limit and a valid timezone',
    )
  if (
    b.maxWeeklyKm != null &&
    (!Number.isFinite(b.maxWeeklyKm) ||
      b.maxWeeklyKm <= 0 ||
      b.maxWeeklyKm > 200)
  )
    throw new Error('Invalid weekly distance cap')
  if (
    b.constraints != null &&
    (typeof b.constraints !== 'string' || b.constraints.length > 1000)
  )
    throw new Error('Keep constraints under 1,000 characters')
  if (
    b.primaryGoalId != null &&
    (typeof b.primaryGoalId !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(b.primaryGoalId))
  )
    throw new Error('Invalid primary goal')
  return {
    primaryGoalId: b.primaryGoalId ?? null,
    maxWeeklyKm: b.maxWeeklyKm ?? null,
    avoidConsecutiveDays: !!b.avoidConsecutiveDays,
    constraints: b.constraints ?? '',
    days: b.days,
    maxMinutes: b.maxMinutes,
    longRunDay: b.longRunDay,
    timezone: b.timezone,
    easyOnly: b.easyOnly,
    startingWeeklyKm: b.startingWeeklyKm,
    autoAdapt: b.autoAdapt,
  }
}
export function validateConfig(c: any): SessionConfig {
  if (
    !c ||
    typeof c.name !== 'string' ||
    c.name.length > 200 ||
    ![
      'easy',
      'long_easy',
      'threshold',
      'interval_5k',
      'easy_strides',
      'recovery',
      'race',
      'rest',
    ].includes(c.sessionType) ||
    !Array.isArray(c.blocks) ||
    c.blocks.length > 30 ||
    JSON.stringify(c).length > 30000
  )
    throw new Error('Invalid workout structure')
  for (const key of ['warmupMin', 'warmupM', 'cooldownMin', 'cooldownM'])
    if (!Number.isFinite(c[key]) || c[key] < 0 || c[key] > 100000)
      throw new Error('Invalid workout amount')
  for (const block of c.blocks) {
    if (
      !['continuous', 'interval'].includes(block.kind) ||
      !['distance', 'time'].includes(block.mode)
    )
      throw new Error('Invalid workout block')
    for (const key of ['distanceM', 'durationMin'])
      if (!Number.isFinite(block[key]) || block[key] < 0 || block[key] > 100000)
        throw new Error('Invalid block amount')
    if (
      block.kind === 'interval' &&
      (!Number.isInteger(block.reps) ||
        block.reps < 1 ||
        block.reps > 100 ||
        !Number.isFinite(block.recoveryM) ||
        block.recoveryM < 0 ||
        !Number.isFinite(block.recoveryMin) ||
        block.recoveryMin < 0)
    )
      throw new Error('Invalid repetitions')
  }
  if (
    !['distance', 'time'].includes(c.warmupMode) ||
    !['distance', 'time'].includes(c.cooldownMode)
  )
    throw new Error('Invalid warmup or cooldown')
  return c
}
export function configMeters(c: SessionConfig) {
  return (
    (c.warmupMode === 'distance' ? c.warmupM : 0) +
    (c.cooldownMode === 'distance' ? c.cooldownM : 0) +
    c.blocks.reduce(
      (n, b) =>
        n +
        (b.mode === 'distance' ? b.distanceM : 0) *
          (b.kind === 'interval' ? b.reps : 1) +
        (b.kind === 'interval' && b.recoveryMode === 'distance'
          ? b.recoveryM * Math.max(0, b.reps - 1)
          : 0),
      0,
    )
  )
}
function workout(type: string, km: number, pace: number): SessionConfig {
  return {
    name:
      type === 'threshold'
        ? 'Controlled tempo'
        : type === 'long_easy'
          ? 'Conversational long run'
          : 'Easy aerobic run',
    sessionType: type,
    warmupMode: 'time',
    warmupMin: 0,
    warmupM: 0,
    warmupPace: '',
    cooldownMode: 'time',
    cooldownMin: 0,
    cooldownM: 0,
    cooldownPace: '',
    blocks: [
      {
        id: 'main',
        kind: 'continuous',
        label: 'Keep effort controlled',
        mode: 'distance',
        distanceM: Math.round(km * 1000),
        durationMin: 0,
        targetPace: formatGoalTime(pace),
      },
    ],
  }
}
export function canAdapt(session: PlanSession, today: string) {
  return (
    session.source === 'coach' &&
    !session.locked &&
    session.plan_date > today &&
    session.status === 'planned' &&
    !session.activity_id
  )
}
export function generateWeek(input: {
  preferences: TrainingPreferences
  sessions: PlanSession[]
  runs: any[]
  goals: UserGoal[]
  estimates: Record<string, number>
  trainingGoals?: { metric: string; target: number; active: boolean }[]
  now: Date
  id: () => string
}) {
  const { preferences: p, sessions, runs, goals, estimates, now, id } = input
  const today = localDate(now, p.timezone)
  const race =
    goals.find(
      (g) =>
        g.id === p.primaryGoalId &&
        (g.status ?? 'active') === 'active' &&
        g.race_date >= today,
    ) ?? primaryRace(goals, today)
  const weeks = race
    ? Math.ceil((Date.parse(race.race_date) - Date.parse(today)) / 604800000)
    : null
  const phase =
    weeks == null
      ? 'Build consistency'
      : weeks <= 2
        ? 'Taper and arrive rested'
        : weeks <= 6
          ? 'Race-specific preparation'
          : 'Aerobic foundation'
  const recent = runs.filter(
    (r) =>
      new Date(r.start_date).getTime() >= now.getTime() - 28 * 86400000 &&
      new Date(r.start_date) <= now,
  )
  const weeklyKm = recent.reduce((n, r) => n + r.distance / 1000, 0) / 4
  const distanceGoal =
    (input.trainingGoals?.find((g) => g.active && g.metric === 'distance')
      ?.target ?? Infinity) / 1000
  const frequencyGoal = input.trainingGoals?.find(
    (g) => g.active && g.metric === 'runs',
  )?.target
  const budget = Math.min(
    weeklyKm > 0 ? weeklyKm : p.startingWeeklyKm,
    p.maxWeeklyKm ?? Infinity,
    distanceGoal ?? Infinity,
  )
  if (budget <= 0)
    throw new Error(
      'Add recent runs or your current weekly distance before generating a plan',
    )
  const recentWeek = recent
    .filter(
      (r) => new Date(r.start_date).getTime() >= now.getTime() - 7 * 86400000,
    )
    .reduce((n, r) => n + r.distance / 1000, 0)
  const factor =
    recentWeek > budget * 1.3 ? 0.8 : weeks != null && weeks <= 2 ? 0.7 : 1
  const pace = estimates['10k']
    ? estimates['10k'] / 10 + 75
    : recent.length
      ? recent.reduce((n, r) => n + r.moving_time, 0) /
        Math.max(
          1,
          recent.reduce((n, r) => n + r.distance / 1000, 0),
        )
      : 420
  const preserved = sessions.filter((s) => !canAdapt(s, today))
  const rows: PlanSession[] = []
  let hardDay: string | null = null
  let remaining = Math.max(
    0,
    budget * factor -
      preserved
        .filter((s) => s.plan_date > today && s.plan_date <= addDays(today, 7))
        .reduce((n, s) => n + (s.target_distance_meters ?? 0) / 1000, 0),
  )
  for (let i = 1; i <= 7; i++) {
    const date = addDays(today, i),
      day = weekday(date)
    if (!p.days.includes(day) || preserved.some((s) => s.plan_date === date))
      continue
    if (
      p.avoidConsecutiveDays &&
      [...preserved, ...rows].some(
        (s) =>
          s.session_type !== 'rest' &&
          Math.abs(Date.parse(s.plan_date) - Date.parse(date)) <= 86400000,
      )
    )
      continue
    if (
      frequencyGoal &&
      [
        ...preserved.filter(
          (s) =>
            s.plan_date > today &&
            s.plan_date <= addDays(today, 7) &&
            s.session_type !== 'rest',
        ),
        ...rows,
      ].length >= frequencyGoal
    )
      continue
    const daysLeft = Array.from({ length: 8 - i }, (_, j) =>
      addDays(date, j),
    ).filter(
      (d) =>
        p.days.includes(weekday(d)) &&
        !preserved.some((s) => s.plan_date === d),
    ).length
    const km = Math.min(
      remaining / Math.max(1, daysLeft),
      (p.maxMinutes * 60) / pace,
    )
    if (km < 1) continue
    const hardBlocked = [...preserved, ...rows].some(
      (s) =>
        ['threshold', 'interval_5k', 'race', 'long_easy'].includes(
          s.session_type,
        ) && Math.abs(Date.parse(s.plan_date) - Date.parse(date)) <= 86400000,
    )
    const quality =
      !p.easyOnly &&
      budget >= 20 &&
      !!estimates['10k'] &&
      !hardDay &&
      !hardBlocked &&
      day !== p.longRunDay &&
      weekday(addDays(date, 1)) !== p.longRunDay &&
      (weeks == null || weeks > 2)
    const type = quality
      ? 'threshold'
      : day === p.longRunDay && !hardBlocked
        ? 'long_easy'
        : 'easy'
    if (quality) hardDay = date
    const config = workout(type, km, pace)
    if (quality) {
      config.name = 'Easy run with a short controlled tempo'
      config.blocks = [
        {
          id: 'easy',
          kind: 'continuous',
          label: 'Easy running',
          mode: 'distance',
          distanceM: Math.round(km * 800),
          durationMin: 0,
          targetPace: formatGoalTime(pace),
        },
        {
          id: 'tempo',
          kind: 'continuous',
          label: 'Controlled, never all-out',
          mode: 'distance',
          distanceM: Math.round(km * 200),
          durationMin: 0,
          targetPace: formatGoalTime(estimates['10k'] / 10 + 20),
        },
      ]
    }
    const existing = sessions.find(
      (s) => s.plan_date === date && canAdapt(s, today),
    )
    rows.push({
      id: existing?.id ?? id(),
      plan_date: date,
      session_index: 0,
      session_type: type,
      description: `${phase}. ${config.name}. No catch-up mileage.`,
      target_distance_meters: Math.round(km * 1000),
      config,
      source: 'coach',
      locked: false,
      status: 'planned',
      activity_id: null,
    })
    remaining -= km
  }
  return {
    rows,
    deleteIds: sessions
      .filter(
        (s) =>
          canAdapt(s, today) &&
          s.plan_date <= addDays(today, 7) &&
          !rows.some((r) => r.id === s.id),
      )
      .map((s) => s.id),
    phase,
    reason: `${phase}: based on ${weeklyKm.toFixed(1)} km/week observed, availability and completed training. Today and protected sessions preserved.`,
    today,
  }
}
export function unambiguousMatches(
  sessions: PlanSession[],
  runs: any[],
  timezone: string,
) {
  const linked = new Set(sessions.map((s) => s.activity_id).filter(Boolean))
  const candidates = new Map<string, any[]>()
  for (const session of sessions.filter(
    (s) =>
      s.status === 'planned' &&
      !s.matching_disabled &&
      !s.activity_id &&
      s.session_type !== 'rest',
  )) {
    const options = runs.filter(
      (r) =>
        !linked.has(r.id) &&
        compatibleRun(session.session_type, r.run_type) &&
        localDate(new Date(r.start_date), timezone) === session.plan_date &&
        session.target_distance_meters != null &&
        Math.abs(r.distance / session.target_distance_meters - 1) <= 0.2,
    )
    candidates.set(session.id, options)
  }
  return sessions.flatMap((s) => {
    const matches = candidates.get(s.id)
    if (matches?.length !== 1) return []
    const run = matches[0]
    if (
      Array.from(candidates.values()).filter((c) =>
        c.some((r) => r.id === run.id),
      ).length !== 1
    )
      return []
    return [{ ...s, activity_id: run.id, status: 'completed' as const }]
  })
}

export function compatibleRun(session: string, run: string | null | undefined) {
  if (!run)
    return ['easy', 'recovery', 'long_easy', 'easy_strides'].includes(session)
  const quality = [
    'threshold',
    'tempo',
    'intervals',
    'interval_5k',
    'interval_10k',
    'race',
  ]
  if (session === 'race') return run === 'race'
  if (quality.includes(session)) return quality.includes(run) && run !== 'race'
  return !quality.includes(run)
}
export function progression(
  goals: UserGoal[],
  preferences: TrainingPreferences,
  now = new Date(),
) {
  const today = localDate(now, preferences.timezone)
  const goal =
    goals.find(
      (g) =>
        g.id === preferences.primaryGoalId &&
        (g.status ?? 'active') === 'active' &&
        g.race_date >= today,
    ) ?? primaryRace(goals, today)
  if (!goal)
    return [
      {
        start: today,
        end: addDays(today, 28),
        focus:
          'Build a repeatable routine within your observed training volume.',
      },
    ]
  const specific = addDays(goal.race_date, -42),
    taper = addDays(goal.race_date, -14)
  return [
    {
      start: today,
      end: specific,
      focus:
        'Aerobic foundation: consistent easy running, with distance limited by recent training.',
    },
    {
      start: specific > today ? specific : today,
      end: taper,
      focus:
        'Race-specific preparation: one controlled quality session when current evidence and recovery allow.',
    },
    {
      start: taper > today ? taper : today,
      end: goal.race_date,
      focus:
        'Taper: reduce volume and preserve recovery before ' + goal.label + '.',
    },
  ].filter((p) => p.end >= p.start)
}
