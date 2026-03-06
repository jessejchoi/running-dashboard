import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function PATCH(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { activityId, excluded } = await request.json()
  if (!activityId) return NextResponse.json({ error: 'Missing activityId' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('activities')
    .update({ excluded_from_analysis: excluded })
    .eq('id', activityId)
    .eq('athlete_id', athleteId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
