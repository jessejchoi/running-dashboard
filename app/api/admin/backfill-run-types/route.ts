import { getAthleteId } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildUserPaceProfile } from '@/lib/strava'
import { categorizeRun } from '@/lib/run-classification'
import { updateLatestEstimates } from '@/lib/latestEstimates'

export async function POST() {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: athletes } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id')

  const ids = (athletes ?? []).map(a => a.athlete_id as number)
  const results: { athleteId: number; updated: number; status: string }[] = []

  for (const id of ids) {
    try {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('max_hr')
        .eq('athlete_id', id)
        .maybeSingle()
      const maxHr = profile?.max_hr ?? undefined
      const [zones, activitiesRes] = await Promise.all([
        buildUserPaceProfile(id, maxHr),
        supabaseAdmin
          .from('activities')
          .select('id, distance, average_speed, average_heartrate, run_type, run_type_manual, laps, splits, is_race, type')
          .eq('athlete_id', id)
          .eq('type', 'Run'),
      ])
      const activities = activitiesRes.data ?? []
      let updated = 0

      for (const activity of activities) {
        if (activity.run_type_manual === true) continue
        if (activity.is_race || activity.run_type === 'race') continue
        if (!activity.average_speed || !activity.distance) continue

        const nextType = categorizeRun({
          distance: activity.distance,
          average_speed: activity.average_speed,
          average_heartrate: activity.average_heartrate ?? undefined,
          laps: activity.laps ?? [],
          splits: activity.splits ?? [],
        }, zones ?? undefined, maxHr)

        if (nextType === activity.run_type && activity.run_type_manual === false) continue

        const { error } = await supabaseAdmin
          .from('activities')
          .update({ run_type: nextType, run_type_manual: false })
          .eq('id', activity.id)

        if (error) throw error
        updated++
      }

      await updateLatestEstimates(id)
      results.push({ athleteId: id, updated, status: 'ok' })
    } catch (err: any) {
      results.push({ athleteId: id, updated: 0, status: `error: ${err.message}` })
    }
  }

  return NextResponse.json({ processed: ids.length, results })
}

export async function GET(){return NextResponse.json({error:'Use POST'},{status:405})}
