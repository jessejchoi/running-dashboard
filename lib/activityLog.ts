import { zonedDateTime, addDays, validTimezone } from '@/lib/calendar'
import { supabaseAdmin } from '@/lib/supabase'
export const SUMMARY_COLUMNS =
  'id,start_date,distance,moving_time,average_speed,average_heartrate,suffer_score,run_type,run_type_manual,type,name,trainer:raw->trainer'
export function decodeCursor(
  value: string | null,
): { date: string; id: number } | null {
  if (!value) return null
  try {
    const v = JSON.parse(Buffer.from(value, 'base64url').toString())
    if (
      typeof v.date !== 'string' ||
      !/^\d{4}-\d\d-\d\dT[\d:.+Z-]+$/.test(v.date) ||
      !Number.isSafeInteger(v.id) ||
      v.id <= 0
    )
      throw 0
    return v
  } catch {
    throw new Error('Invalid cursor')
  }
}
export async function listRuns(athleteId: number, params: URLSearchParams) {
  const timezone = params.get('timezone') ?? 'Asia/Jakarta'
  if (!validTimezone(timezone)) throw new Error('Invalid timezone')
  const cursor = decodeCursor(params.get('cursor'))
  const limit = Math.min(
    50,
    Math.max(1, Number(params.get('limit') ?? 50) || 50),
  )
  let q = supabaseAdmin
    .from('activities')
    .select(SUMMARY_COLUMNS)
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .order('start_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (cursor)
    q = q.or(
      `start_date.lt.${cursor.date},and(start_date.eq.${cursor.date},id.lt.${cursor.id})`,
    )
  for (const key of ['from', 'to']) {
    const date = params.get(key)
    if (date) {
      if (!/^\d{4}-\d\d-\d\d$/.test(date) || !Number.isFinite(Date.parse(date)))
        throw new Error('Invalid date')
      q =
        key === 'from'
          ? q.gte('start_date', zonedDateTime(date + 'T00:00', timezone))
          : q.lt(
              'start_date',
              zonedDateTime(addDays(date, 1) + 'T00:00', timezone),
            )
    }
  }
  const type = params.get('run_type')
  if (type) {
    if (!/^[a-z_0-9]{1,30}$/.test(type)) throw new Error('Invalid run type')
    q = q.eq('run_type', type)
  }
  const { data, error } = await q
  if (error) throw new Error('Could not load runs')
  const items = (data ?? []).slice(0, limit),
    last = items[items.length - 1]
  return {
    items,
    nextCursor:
      (data ?? []).length > limit && last
        ? Buffer.from(
            JSON.stringify({ date: last.start_date, id: last.id }),
          ).toString('base64url')
        : null,
  }
}
