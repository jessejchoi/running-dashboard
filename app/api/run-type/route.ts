import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { updateLatestEstimates } from '@/lib/latestEstimates'
import { cookies } from 'next/headers'
import { RUN_TYPES } from '@/lib/runtypes'

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
  if (runType && !Object.keys(RUN_TYPES).includes(runType)) {
    return NextResponse.json({ error: 'Invalid run type' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    run_type: runType ?? null,
    run_type_manual: runType != null,
  }
  // Keep is_race in sync: tagging as race sets it, clearing or changing away unsets it
  update.is_race = runType === 'race'

  const { data, error } = await supabaseAdmin
    .from('activities')
    .update(update)
    .select('id')
    .eq('id', activityId)
    .eq('athlete_id', numericAthleteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Run not found or not owned by athlete' }, { status: 404 })
  }

  // Re-run analysis in background — recategorization changes which runs feed the engine
  void updateLatestEstimates(numericAthleteId)

  return NextResponse.json({ ok: true })
}
