import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET() {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('user_goals')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('race_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json()
  const { distance_key, label, target_secs, current_secs, race_date } = body

  const { data, error } = await supabaseAdmin
    .from('user_goals')
    .upsert({
      athlete_id: parseInt(athleteId),
      distance_key,
      label,
      target_secs,
      current_secs: current_secs || null,
      race_date,
    }, { onConflict: 'athlete_id,distance_key' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
