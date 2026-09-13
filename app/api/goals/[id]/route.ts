import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRace } from '@/lib/goalValidation'
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    if (body.action === 'primary') {
      const { error } = await supabaseAdmin.rpc('set_primary_race', {
        p_athlete: Number(id),
        p_goal: params.id,
      })
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    const goal = validateRace(body)
    const { data, error } = await supabaseAdmin
      .from('user_goals')
      .update(goal)
      .eq('id', params.id)
      .eq('athlete_id', id)
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not update goal' },
      { status: 400 },
    )
  }
}
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabaseAdmin
    .from('user_goals')
    .delete()
    .eq('id', params.id)
    .eq('athlete_id', id)
  return NextResponse.json(
    error ? { error: 'Could not delete goal' } : { ok: true },
    { status: error ? 503 : 200 },
  )
}
