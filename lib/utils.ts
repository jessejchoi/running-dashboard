import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// ─── Pace / speed conversions ─────────────────────────────────────────────────

/** Converts m/s to min/km pace string e.g. "4:32" */
export function speedToPace(speedMs: number): string {
  if (!speedMs || speedMs === 0) return '--'
  const secsPerKm = 1000 / speedMs
  const mins = Math.floor(secsPerKm / 60)
  const secs = Math.round(secsPerKm % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
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

export function formatDistance(m: number): string {
  return `${(m / 1000).toFixed(2)} km`
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
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function isoWeek(date: Date): string {
  const w = getWeekStart(date)
  return w.toISOString().split('T')[0]
}

// ─── Goal progress ────────────────────────────────────────────────────────────

export interface RaceGoal {
  label: string
  distance: number       // meters
  targetPace: number     // seconds per km
  targetTime: number     // seconds
  raceDate: Date
}

export const RACE_GOALS: RaceGoal[] = [
  {
    label: 'Sub 22:30 5K',
    distance: 5000,
    targetPace: 270,          // 4:30/km
    targetTime: 22 * 60 + 30,
    raceDate: new Date('2026-04-15'),
  },
  {
    label: 'Sub 45:00 10K',
    distance: 10000,
    targetPace: 270,          // 4:30/km
    targetTime: 45 * 60,
    raceDate: new Date('2026-07-15'),
  },
  {
    label: 'Sub 1:40 Half Marathon',
    distance: 21097,
    targetPace: 284,          // 4:44/km  (100min / 21.097km)
    targetTime: 100 * 60,
    raceDate: new Date('2026-10-31'),
  },
]

// ─── VDOT (Jack Daniels) ───────────────────────────────────────────────────
// Returns VDOT from a 5K time in seconds.
export function vdotFrom5K(secsTotal: number): number {
  const tMin = secsTotal / 60
  const speed = 5000 / tMin  // m/min
  const pctVO2max = 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)
  const vo2 = -4.6 + 0.182258 * speed + 0.000104 * speed * speed
  return Math.round(vo2 / pctVO2max * 10) / 10
}
