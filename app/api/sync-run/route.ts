import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { getValidToken, fetchActivityDetail, fetchActivityStreams } from '@/lib/strava'
import { generateCoachNote } from '@/lib/coachNote'

export async function POST(req: NextRequest) {
  const cookieStore = cookies()
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { activityId } = await req.json()
  if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

  const token = await getValidToken(parseInt(athleteId))
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 })

  const [detail, streams] = await Promise.all([
    fetchActivityDetail(token, activityId),
    fetchActivityStreams(token, activityId),
  ])

  await supabaseAdmin
    .from('activities')
    .update({
      laps: detail.laps ?? null,
      splits: detail.splits_metric ?? null,
      streams: streams ?? null,
      average_heartrate: detail.average_heartrate ?? null,
      max_heartrate: detail.max_heartrate ?? null,
      detail_synced: true,
    })
    .eq('id', activityId)
    .eq('athlete_id', athleteId)

  // Fire-and-forget coach note generation
  generateCoachNote(parseInt(activityId), parseInt(athleteId)).catch(err =>
    console.error('[coach-note/eager]', err instanceof Error ? err.message : String(err))
  )

  return NextResponse.json({ ok: true })
}
