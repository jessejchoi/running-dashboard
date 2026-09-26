export function validTimezone(zone: unknown): zone is string {
  try {
    if (typeof zone !== 'string') return false
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return true
  } catch {
    return false
  }
}
export function localDate(now = new Date(), zone = 'Asia/Jakarta') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
export function addDays(date: string, n: number) {
  return new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000)
    .toISOString()
    .slice(0, 10)
}
export function weekday(date: string) {
  return new Date(date + 'T12:00:00Z').getUTCDay()
}
export function weekStart(date: string) {
  return addDays(date, -((weekday(date) + 6) % 7))
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d\d-\d\d$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
/** Resolve a wall-clock event time in its selected zone, rejecting DST gaps. */
export function zonedDateTime(value: string, zone: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) || !validTimezone(zone))
    throw new Error('Choose a valid event date and time')
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const target = Date.parse(value + 'Z')
  let instant = target
  for (let i = 0; i < 3; i++) {
    const wall = formatter.format(new Date(instant)).replace(' ', 'T')
    instant += target - Date.parse(wall + 'Z')
  }
  if (formatter.format(new Date(instant)).replace(' ', 'T') !== value)
    throw new Error(
      'That time does not exist in this timezone; choose another time',
    )
  return new Date(instant).toISOString()
}

// Used only when nothing better is known about where someone runs.
export const DEFAULT_TIMEZONE = 'Asia/Jakarta'

/** Strava labels activity zones as "(GMT+07:00) Asia/Jakarta". */
export function stravaTimezone(value?: string | null): string | null {
  const zone = value?.split(' ').pop()
  return zone && validTimezone(zone) ? zone : null
}

export interface DatedRun {
  start_date: string
  start_date_local?: string | null
  raw?: { start_date_local?: string } | null
}

function localStart(run: DatedRun): string | null {
  return run.start_date_local ?? run.raw?.start_date_local ?? null
}

/** The calendar day a run happened on, in the place it was run. */
export function runDay(run: DatedRun, fallbackZone = DEFAULT_TIMEZONE): string {
  return localStart(run)?.slice(0, 10) ?? localDate(new Date(run.start_date), fallbackZone)
}

/**
 * A run's wall-clock start time as a Date in the runtime's own zone, so
 * date-fns `format` prints the time on the runner's watch wherever it renders.
 */
export function runWallTime(run: DatedRun, fallbackZone = DEFAULT_TIMEZONE): Date {
  const local = localStart(run)
  if (local) return new Date(local.slice(0, 19))
  const wall = new Intl.DateTimeFormat('sv-SE', {
    timeZone: fallbackZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(new Date(run.start_date))
  return new Date(wall.replace(' ', 'T'))
}

/** The zone most members run in, for group views with no single viewer. */
export function commonTimezone(zones: Array<string | null | undefined>): string {
  const counts = new Map<string, number>()
  for (const zone of zones) if (zone) counts.set(zone, (counts.get(zone) ?? 0) + 1)
  let best = DEFAULT_TIMEZONE, bestCount = 0
  for (const [zone, count] of Array.from(counts)) if (count > bestCount) [best, bestCount] = [zone, count]
  return best
}

/** The browser's zone, for form defaults. */
export function browserTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return validTimezone(zone) ? zone : DEFAULT_TIMEZONE
  } catch {
    return DEFAULT_TIMEZONE
  }
}

/** The zone of the most recent run that recorded one. */
export function latestRunTimezone(runs: Array<{ start_date: string; timezone?: string | null }>): string {
  let latest: { start_date: string; zone: string } | null = null
  for (const run of runs) {
    const zone = stravaTimezone(run.timezone)
    if (zone && (!latest || run.start_date > latest.start_date)) latest = { start_date: run.start_date, zone }
  }
  return latest?.zone ?? DEFAULT_TIMEZONE
}
