import { supabaseAdmin } from '@/lib/supabase'
import { validTimezone } from '@/lib/calendar'
export async function groupRole(groupId: string, athleteId: number) {
  const { data, error } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('athlete_id', athleteId)
    .maybeSingle()
  if (error) throw error
  return data?.role as string | undefined
}
export function validateSharedRun(b: any) {
  if (
    !b ||
    typeof b.title !== 'string' ||
    !b.title.trim() ||
    b.title.length > 120 ||
    typeof b.meeting_point !== 'string' ||
    !b.meeting_point.trim() ||
    b.meeting_point.length > 300 ||
    !validTimezone(b.timezone) ||
    !Number.isFinite(Date.parse(b.starts_at)) ||
    !Array.isArray(b.options) ||
    !b.options.length ||
    b.options.length > 6
  )
    throw new Error(
      'Enter a title, time, timezone, meeting point and a distance option',
    )
  const options = b.options.map((o: any) => {
    if (
      typeof o.label !== 'string' ||
      o.label.length > 100 ||
      !Number.isFinite(o.distance_km) ||
      o.distance_km <= 0 ||
      o.distance_km > 100 ||
      typeof o.pace !== 'string' ||
      o.pace.length > 80
    )
      throw new Error('Invalid pace/distance option')
    return { label: o.label, distance_km: o.distance_km, pace: o.pace }
  })
  return {
    title: b.title.trim(),
    meeting_point: b.meeting_point.trim(),
    timezone: b.timezone,
    starts_at: new Date(b.starts_at).toISOString(),
    description: String(b.description ?? '').slice(0, 2000),
    options,
  }
}
