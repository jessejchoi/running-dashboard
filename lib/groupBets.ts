import { distanceKm, distanceLabel, formatGoalTime, type DistanceKey } from '@/lib/goals'

export type BetMode = 'direct' | 'pool'
export type BetMetricType = 'weekly_distance' | 'distance' | 'run_count' | 'longest_run' | 'race_time'
export type BetComparator = 'gte' | 'lte'
export type BetSide = 'for' | 'against'
export type BetStatus = 'open' | 'locked' | 'won' | 'lost' | 'void'

export interface BetActivity {
  id: number
  athlete_id: number
  start_date: string
  distance: number | null
  moving_time: number | null
  matched_distance_key?: string | null
}

export interface BetCore {
  id?: string
  target_athlete_id: number
  metric_type: BetMetricType
  comparator: BetComparator
  target_value: number | null
  distance_key: DistanceKey | null
  target_secs: number | null
  window_start: string
  window_end: string
}

export interface BetResolution {
  achieved: boolean
  currentValue: number
  bestActivityId: number | null
  evidenceLabel: string
  winningSide: BetSide
}

const DISTANCE_KEYS = new Set(['5k', '10k', 'hm', 'fm'])

export function isDistanceKey(value: unknown): value is DistanceKey {
  return typeof value === 'string' && DISTANCE_KEYS.has(value)
}

export function inclusiveWindow(start: string, end: string) {
  return {
    start: new Date(`${start}T00:00:00.000Z`),
    end: new Date(`${end}T23:59:59.999Z`),
  }
}

export function isInBetWindow(activity: BetActivity, bet: Pick<BetCore, 'window_start' | 'window_end'>) {
  const { start, end } = inclusiveWindow(bet.window_start, bet.window_end)
  const when = new Date(activity.start_date)
  return when >= start && when <= end
}

export function compareBetValue(value: number, comparator: BetComparator, target: number) {
  if (comparator === 'lte') return value <= target
  return value >= target
}

export function resolveBetOutcome(bet: BetCore, activities: BetActivity[]): BetResolution {
  const relevant = activities.filter(a =>
    a.athlete_id === bet.target_athlete_id &&
    isInBetWindow(a, bet)
  )

  if (bet.metric_type === 'run_count') {
    const currentValue = relevant.length
    const target = bet.target_value ?? 0
    const achieved = compareBetValue(currentValue, bet.comparator, target)
    return {
      achieved,
      currentValue,
      bestActivityId: null,
      evidenceLabel: `${currentValue} run${currentValue === 1 ? '' : 's'}`,
      winningSide: achieved ? 'for' : 'against',
    }
  }

  if (bet.metric_type === 'longest_run') {
    const best = relevant.reduce<BetActivity | null>((prev, cur) =>
      (cur.distance ?? 0) > (prev?.distance ?? 0) ? cur : prev
    , null)
    const currentValue = best?.distance ?? 0
    const target = bet.target_value ?? 0
    const achieved = compareBetValue(currentValue, bet.comparator, target)
    return {
      achieved,
      currentValue,
      bestActivityId: best?.id ?? null,
      evidenceLabel: `${(currentValue / 1000).toFixed(1)} km longest`,
      winningSide: achieved ? 'for' : 'against',
    }
  }

  if (bet.metric_type === 'race_time') {
    const raceMatches = relevant.filter(a =>
      bet.distance_key &&
      a.matched_distance_key === bet.distance_key &&
      (a.moving_time ?? 0) > 0
    )
    const best = raceMatches.reduce<BetActivity | null>((prev, cur) =>
      (cur.moving_time ?? Infinity) < (prev?.moving_time ?? Infinity) ? cur : prev
    , null)
    const currentValue = best?.moving_time ?? Infinity
    const target = bet.target_secs ?? 0
    const achieved = Number.isFinite(currentValue) && compareBetValue(currentValue, bet.comparator, target)
    return {
      achieved,
      currentValue: Number.isFinite(currentValue) ? currentValue : 0,
      bestActivityId: best?.id ?? null,
      evidenceLabel: best
        ? `${formatGoalTime(best.moving_time ?? 0)} ${bet.distance_key ? distanceLabel(bet.distance_key) : ''}`
        : `No ${bet.distance_key ? distanceLabel(bet.distance_key) : 'race'} found`,
      winningSide: achieved ? 'for' : 'against',
    }
  }

  const currentValue = relevant.reduce((sum, a) => sum + (a.distance ?? 0), 0)
  const target = bet.target_value ?? 0
  const achieved = compareBetValue(currentValue, bet.comparator, target)
  return {
    achieved,
    currentValue,
    bestActivityId: null,
    evidenceLabel: `${(currentValue / 1000).toFixed(1)} km`,
    winningSide: achieved ? 'for' : 'against',
  }
}

export function metricTargetLabel(bet: Pick<BetCore, 'metric_type' | 'target_value' | 'target_secs' | 'distance_key' | 'comparator'>) {
  const verb = bet.comparator === 'lte' ? 'under' : 'at least'
  if (bet.metric_type === 'run_count') return `${verb} ${Math.round(bet.target_value ?? 0)} runs`
  if (bet.metric_type === 'longest_run') return `${verb} ${((bet.target_value ?? 0) / 1000).toFixed(1)} km in one run`
  if (bet.metric_type === 'race_time') {
    const label = bet.distance_key ? distanceLabel(bet.distance_key) : 'race'
    return `${verb} ${formatGoalTime(bet.target_secs ?? 0)} for ${label}`
  }
  return `${verb} ${((bet.target_value ?? 0) / 1000).toFixed(1)} km`
}

export function metricProgressPercent(bet: BetCore, currentValue: number) {
  if (bet.metric_type === 'race_time') {
    if (!currentValue || !bet.target_secs) return 0
    if (bet.comparator === 'lte') return Math.min(100, (bet.target_secs / currentValue) * 100)
    return Math.min(100, (currentValue / bet.target_secs) * 100)
  }
  const target = bet.target_value ?? 0
  if (target <= 0) return 0
  return Math.min(100, (currentValue / target) * 100)
}

export function defaultWeekWindow(now = new Date()) {
  const start = new Date(now)
  const day = start.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  start.setUTCDate(start.getUTCDate() - diff)
  start.setUTCHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 6)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

export function targetMetersFromDistanceKey(key: DistanceKey) {
  return distanceKm(key) * 1000
}
