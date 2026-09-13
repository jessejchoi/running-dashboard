import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRace } from '@/lib/goalValidation'
export async function GET() {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('user_goals')
    .select('*')
    .eq('athlete_id', id)
    .order('race_date')
  return NextResponse.json(
    error ? { error: 'Could not load goals' } : (data ?? []),
    { status: error ? 503 : 200 },
  )
}
export async function POST(req: NextRequest) {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const goal = validateRace(await req.json())
    const { data, error } = await supabaseAdmin
      .from('user_goals')
      .insert({ ...goal, athlete_id: Number(id) })
      .select()
      .single()
    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not save goal' },
      { status: 400 },
    )
  }
}
