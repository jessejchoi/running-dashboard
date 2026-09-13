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
export function eventLocalTime(iso: string, zone: string) {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso))
    .replace(' ', 'T')
}
