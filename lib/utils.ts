import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// ─── Unit types ───────────────────────────────────────────────────────────────

export type DistanceUnit = 'km' | 'miles'

const METERS_PER_MILE = 1609.344

export function metersToMiles(m: number): number {
  return m / METERS_PER_MILE
}

// ─── Pace / speed conversions ─────────────────────────────────────────────────

/** Converts m/s to pace string e.g. "4:32" — handles secs=60 rollover */
export function speedToPace(speedMs: number, unit: DistanceUnit = 'km'): string {
  if (!speedMs || speedMs === 0) return '--'
  const metersPerUnit = unit === 'miles' ? METERS_PER_MILE : 1000
  const secsPerUnit = metersPerUnit / speedMs
  let mins = Math.floor(secsPerUnit / 60)
  let secs = Math.round(secsPerUnit % 60)
  if (secs === 60) { mins += 1; secs = 0 }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/** Pace unit label string e.g. "/km" or "/mi" */
export function paceUnitLabel(unit: DistanceUnit): string {
  return unit === 'miles' ? '/mi' : '/km'
}

/** Converts min/km pace string to seconds per km */
export function paceToSeconds(pace: string): number {
  const [m, s] = pace.split(':').map(Number)
  return m * 60 + s
}

/** Converts m/s to seconds-per-km number */
export function speedToPaceSeconds(speedMs: number): number {
  if (!speedMs) return 0
  return 1000 / speedMs
}

// ─── Distance formatting ──────────────────────────────────────────────────────

export function metersToKm(m: number): number {
  return m / 1000
}

export function formatDistance(m: number, unit: DistanceUnit = 'km'): string {
  if (unit === 'miles') return `${metersToMiles(m).toFixed(2)} mi`
  return `${(m / 1000).toFixed(2)} km`
}

/** Short distance (1 decimal) with unit label */
export function formatDistanceShort(m: number, unit: DistanceUnit = 'km'): string {
  if (unit === 'miles') return `${metersToMiles(m).toFixed(1)} mi`
  return `${(m / 1000).toFixed(1)} km`
}

/** Distance unit label: "km" or "mi" */
export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === 'miles' ? 'mi' : 'km'
}

// ─── Time formatting ──────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ─── Timezone ─────────────────────────────────────────────────────────────────

/**
 * Strava returns start_date in UTC. Convert to Jakarta local time (WIB = UTC+7).
 * Use this instead of new Date(str) for all display purposes.
 */
export function toJakartaDate(utcStr: string): Date {
  const d = new Date(utcStr)
  return new Date(d.getTime() + 7 * 60 * 60 * 1000)
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function isoWeek(date: Date): string {
  const w = getWeekStart(date)
  return w.toISOString().split('T')[0]
}

/**
 * Compute weekly run streak for an athlete.
 * Uses Jakarta timezone (UTC+7) for week boundary calculation.
 * A "week" is Mon–Sun. Streak = consecutive weeks with ≥1 run,
 * counting back from the current or most recent week.
 */
export function computeStreak(
  runs: Array<{ start_date: string; athlete_id: number }>,
  athleteId: number
): number {
  const myRuns = runs.filter(r => r.athlete_id === athleteId)
  if (!myRuns.length) return 0

  const jakartaWeekStartMs = (utcStr: string) => {
    const jakarta = toJakartaDate(utcStr)
    const day = jakarta.getUTCDay()
    const diff = jakarta.getUTCDate() - day + (day === 0 ? -6 : 1)
    const weekStartJakartaUtc = Date.UTC(jakarta.getUTCFullYear(), jakarta.getUTCMonth(), diff)
    return weekStartJakartaUtc
  }

  // Get unique week-start timestamps (Monday midnight Jakarta)
  const weekStarts = Array.from(
    new Set(myRuns.map(r => jakartaWeekStartMs(r.start_date)))
  ).sort((a, b) => b - a)

  if (!weekStarts.length) return 0

  // Must have run this week or last week to have an active streak
  const thisWeek = jakartaWeekStartMs(new Date().toISOString())
  const lastWeek = thisWeek - 7 * 24 * 60 * 60 * 1000

  if (weekStarts[0] !== thisWeek && weekStarts[0] !== lastWeek) return 0

  let streak = 1
  for (let i = 1; i < weekStarts.length; i++) {
    if (weekStarts[i] === weekStarts[i - 1] - 7 * 24 * 60 * 60 * 1000) streak++
    else break
  }
  return streak
}

// ─── Goal progress ────────────────────────────────────────────────────────────

export interface RaceGoal {
  label: string
  distance: number
  targetPace: number
  targetTime: number
  raceDate: Date
}

export const RACE_GOALS: RaceGoal[] = [
  {
    label: 'Sub 22:30 5K',
    distance: 5000,
    targetPace: 270,
    targetTime: 22 * 60 + 30,
    raceDate: new Date('2026-04-15'),
  },
  {
    label: 'Sub 45:00 10K',
    distance: 10000,
    targetPace: 270,
    targetTime: 45 * 60,
    raceDate: new Date('2026-07-15'),
  },
  {
    label: 'Sub 1:40 Half Marathon',
    distance: 21097,
    targetPace: 284,
    targetTime: 100 * 60,
    raceDate: new Date('2026-10-31'),
  },
]

// ─── Mile splits aggregation ──────────────────────────────────────────────────

/**
 * Strava stores km splits. This re-aggregates them into mile splits by
 * proportionally splitting each km chunk at the mile boundaries.
 */
export function aggregateToMileSplits(splits: {
  distance?: number
  moving_time?: number
  average_speed?: number
  average_heartrate?: number
  [key: string]: any
}[]): typeof splits {
  const MILE_M = 1609.344
  const result: typeof splits = []

  let accDist = 0
  let accTime = 0
  let accHRWeighted = 0
  let accHasHR = false

  function flush() {
    if (accDist < 10) return
    result.push({
      distance: accDist,
      moving_time: accTime,
      average_speed: accDist / (accTime || 1),
      average_heartrate: accHasHR ? Math.round(accHRWeighted / (accTime || 1)) : undefined,
    })
    accDist = 0; accTime = 0; accHRWeighted = 0; accHasHR = false
  }

  for (const split of splits) {
    let remDist = split.distance ?? 0
    let remTime = split.moving_time ?? 0
    const hr = split.average_heartrate ?? null

    while (remDist > 0.5) {
      const space = MILE_M - accDist
      if (remDist <= space) {
        accDist += remDist
        accTime += remTime
        if (hr) { accHRWeighted += hr * remTime; accHasHR = true }
        remDist = 0
      } else {
        // Split proportionally at mile boundary
        const frac = space / remDist
        const fillTime = Math.round(remTime * frac)
        accDist += space
        accTime += fillTime
        if (hr) { accHRWeighted += hr * fillTime; accHasHR = true }
        flush()
        remDist -= space
        remTime -= fillTime
      }
    }
  }
  flush() // partial last mile
  return result
}

// ─── VDOT (Jack Daniels) ──────────────────────────────────────────────────────

export function vdotFrom5K(secsTotal: number): number {
  const tMin = secsTotal / 60
  const speed = 5000 / tMin
  const pctVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)
  const vo2 = -4.6 + 0.182258 * speed + 0.000104 * speed * speed
  return Math.round(vo2 / pctVO2max * 10) / 10
}
