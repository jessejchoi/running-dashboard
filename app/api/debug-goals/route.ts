import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET() {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'not authed' })

  const { data, error } = await supabaseAdmin
    .from('user_goals')
    .select('*')
    .eq('athlete_id', parseInt(athleteId))

  return NextResponse.json({
    athleteId_raw: athleteId,
    athleteId_int: parseInt(athleteId),
    goals: data,
    error: error?.message,
  })
}
