import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: members } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', params.id)

  const memberIds = (members ?? []).map(m => m.athlete_id)

  // Next 28 days from today (client-supplied date avoids server UTC offset issues)
  const todayParam = req.nextUrl.searchParams.get('today')
  const todayStr = todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam) ? todayParam : new Date().toISOString().slice(0, 10)
  const todayDate = new Date(todayStr + 'T00:00:00Z')
  const from = todayStr
  const to = new Date(todayDate.getTime() + 27 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: plans, error } = await supabaseAdmin
    .from('user_plans')
    .select('id, athlete_id, plan_date, session_index, session_type, description, target_distance_meters')
    .order('session_index', { ascending: true })
    .in('athlete_id', memberIds)
    .gte('plan_date', from)
    .lte('plan_date', to)
    .order('plan_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plans: plans ?? [] })
}
