import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { updateLatestEstimates } from '@/lib/latestEstimates'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { detectRaceFieldsForRunType, isManualRunType } from '@/lib/run-classification'

export async function PATCH(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const numericAthleteId = Number(athleteId)
  if (!Number.isFinite(numericAthleteId)) {
    return NextResponse.json({ error: 'Invalid athlete id' }, { status: 400 })
  }

  const { activityId, runType } = await request.json()

  if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })
  if (runType && !isManualRunType(runType)) {
    return NextResponse.json({ error: 'Invalid run type' }, { status: 400 })
  }

  const { data: activity } = await supabaseAdmin
    .from('activities')
    .select('name, distance, matched_distance_key, raw')
    .eq('id', activityId)
    .eq('athlete_id', numericAthleteId)
    .maybeSingle()

  if (!activity) {
    return NextResponse.json({ error: 'Run not found or not owned by athlete' }, { status: 404 })
  }

  const update: Record<string, unknown> = {
    run_type: runType ?? null,
    run_type_manual: runType != null,
  }
  Object.assign(update, detectRaceFieldsForRunType(runType, {
    name: activity.name,
    distance: activity.distance,
    matched_distance_key: activity.matched_distance_key,
    raw: activity.raw,
  }))

  const { data, error } = await supabaseAdmin
    .from('activities')
    .update(update)
    .select('id')
    .eq('id', activityId)
    .eq('athlete_id', numericAthleteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: 'Run not found or not owned by athlete' }, { status: 404 })

  // Re-run analysis in background — recategorization changes which runs feed the engine
  void updateLatestEstimates(numericAthleteId)

  revalidatePath('/')
  revalidatePath('/runs')
  revalidatePath(`/runs/${activityId}`)

  return NextResponse.json({ ok: true, runType: runType ?? null, isManual: runType != null })
}
