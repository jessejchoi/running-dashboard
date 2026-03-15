import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) {
    return NextResponse.json({ error: 'Not a group member' }, { status: 403 })
  }

  const body = await req.json()
  const { name, description, target_meters, start_date, end_date, challenge_type = 'group_distance', config = {} } = body

  if (!name || !start_date || !end_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // target_meters required for group_distance and weekly_quota
  if (challenge_type !== 'fastest_effort' && !target_meters) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: challenge, error } = await supabaseAdmin
    .from('group_challenges')
    .insert({
      group_id: params.id,
      name,
      description: description || null,
      target_meters: challenge_type === 'fastest_effort' ? null : target_meters,
      start_date,
      end_date,
      created_by: parseInt(athleteId),
      challenge_type,
      config,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(challenge)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can delete challenges' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const challengeId = searchParams.get('challengeId')
  if (!challengeId) return NextResponse.json({ error: 'Missing challengeId' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('group_challenges')
    .delete()
    .eq('id', challengeId)
    .eq('group_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
