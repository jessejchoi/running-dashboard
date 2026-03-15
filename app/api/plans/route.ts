import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { plan_date, session_type, description, target_distance_meters, session_index } = body

  if (!plan_date) return NextResponse.json({ error: 'Missing plan_date' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('user_plans')
    .upsert({
      athlete_id: parseInt(athleteId),
      plan_date,
      session_index: session_index ?? 0,
      session_type: session_type || null,
      description: description || null,
      target_distance_meters: target_distance_meters || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id,plan_date,session_index' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const plan_date = searchParams.get('date')
  if (!plan_date) return NextResponse.json({ error: 'Missing date' }, { status: 400 })
  const session_index_param = searchParams.get('session_index')

  let query = supabaseAdmin
    .from('user_plans')
    .delete()
    .eq('athlete_id', parseInt(athleteId))
    .eq('plan_date', plan_date)
  if (session_index_param !== null) {
    query = query.eq('session_index', parseInt(session_index_param))
  }
  const { error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
