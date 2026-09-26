import { supabaseAdmin } from '@/lib/supabase'
import { DEFAULT_TIMEZONE, validTimezone } from '@/lib/calendar'

// user_profiles.timezone follows the zone of each athlete's latest Strava
// activity (kept current by a trigger in migration_023).
export async function athleteTimezones(ids: number[]): Promise<Record<number, string>> {
  const zones: Record<number, string> = {}
  for (const id of ids) zones[id] = DEFAULT_TIMEZONE
  if (!ids.length) return zones
  const { data } = await supabaseAdmin
    .from('user_profiles')
    .select('athlete_id, timezone')
    .in('athlete_id', ids)
  for (const row of data ?? []) {
    if (validTimezone(row.timezone)) zones[row.athlete_id] = row.timezone
  }
  return zones
}

export async function athleteTimezone(id: number): Promise<string> {
  return (await athleteTimezones([id]))[id]
}
