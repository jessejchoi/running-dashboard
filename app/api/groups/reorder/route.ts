import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function PATCH(req: NextRequest) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { order } = await req.json()
  if (!Array.isArray(order)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('user_profiles')
    .upsert({ athlete_id: parseInt(athleteId), group_order: order }, { onConflict: 'athlete_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
