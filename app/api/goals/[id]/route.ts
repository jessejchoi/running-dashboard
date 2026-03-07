import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('user_goals')
    .update(body)
    .eq('id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { error } = await supabaseAdmin
    .from('user_goals')
    .delete()
    .eq('id', params.id)
    .eq('athlete_id', parseInt(athleteId))

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
