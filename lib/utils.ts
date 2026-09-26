import { clsx, type ClassValue } from 'clsx'
import { addDays, localDate, runDay, weekStart, type DatedRun } from './calendar'

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
 * Weekly run streak: consecutive Mon–Sun weeks with at least one run, counting
 * back from this week or last. Each run counts in the week where it was run;
 * `today` is the viewer's local date.
 */
export function computeStreak(
  runs: Array<DatedRun & { athlete_id: number }>,
  athleteId: number,
  today = localDate(),
): number {
  const weeks = new Set(runs.filter(r => r.athlete_id === athleteId).map(r => weekStart(runDay(r))))
  const thisWeek = weekStart(today)
  let week = weeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7)
  let streak = 0
  while (weeks.has(week)) {
    streak++
    week = addDays(week, -7)
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
