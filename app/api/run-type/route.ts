import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { RUN_TYPES } from '@/lib/runtypes'

export async function PATCH(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { activityId, runType } = await request.json()

  if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })
  if (runType && !Object.keys(RUN_TYPES).includes(runType)) {
    return NextResponse.json({ error: 'Invalid run type' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('activities')
    .update({ run_type: runType ?? null, run_type_manual: runType != null })
    .eq('id', activityId)
    .eq('athlete_id', athleteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
