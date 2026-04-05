import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const today = new Date().toISOString().split('T')[0]

  // Active + upcoming challenges
  const { data: challenges } = await supabaseAdmin
    .from('group_challenges')
    .select('id, name, description, challenge_type, target_meters, start_date, end_date, config, created_by_coach')
    .eq('group_id', params.id)
    .gte('end_date', today)
    .order('start_date', { ascending: true })

  if (!challenges?.length) return NextResponse.json({ challenges: [] })

  // Fetch member names
  const { data: memberRows } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', params.id)

  const memberIds = (memberRows ?? []).map(m => m.athlete_id)

  const { data: tokens } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id, athlete_name, athlete_profile')
    .in('athlete_id', memberIds)

  const tokenMap = Object.fromEntries(
    (tokens ?? []).map(t => [t.athlete_id, { name: t.athlete_name, profile_pic: t.athlete_profile ?? null }])
  )

  // Fetch activities covering the span of all active challenges
  const minStart = challenges[0].start_date
  const { data: activities } = await supabaseAdmin
    .from('activities')
    .select('athlete_id, start_date, distance')
    .in('athlete_id', memberIds)
    .gte('start_date', minStart + 'T00:00:00Z')
    .order('start_date', { ascending: false })

  const meAthleteId = parseInt(athleteId)

  const result = (challenges as Array<typeof challenges[0] & { created_by_coach: boolean }>).map(c => {
    const start = new Date(c.start_date + 'T00:00:00Z')
    const end = new Date(c.end_date + 'T23:59:59Z')
    const relevant = (activities ?? []).filter(a => {
      const d = new Date(a.start_date)
      return d >= start && d <= end
    })

    // Per-member totals
    const byMember = memberIds.map(aid => {
      const meters = relevant
        .filter(a => a.athlete_id === aid)
        .reduce((s, a) => s + (a.distance ?? 0), 0)
      return {
        athlete_id: aid,
        name: tokenMap[aid]?.name ?? `Athlete ${aid}`,
        profile_pic: tokenMap[aid]?.profile_pic ?? null,
        is_me: aid === meAthleteId,
        meters,
      }
    }).filter(m => m.meters > 0).sort((a, b) => b.meters - a.meters)

    const totalMeters = relevant.reduce((s, a) => s + (a.distance ?? 0), 0)
    const target = c.target_meters ?? 0
    const pct = target > 0 ? Math.min(100, Math.round((totalMeters / target) * 100)) : 0

    return {
      ...c,
      total_meters: Math.round(totalMeters),
      pct,
      by_member: byMember,
    }
  })

  return NextResponse.json({ challenges: result })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can edit challenges' }, { status: 403 })
  }

  const body = await req.json()
  const { challengeId, name, description, target_meters, start_date, end_date, challenge_type, config } = body
  if (!challengeId) return NextResponse.json({ error: 'Missing challengeId' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (description !== undefined) updates.description = description || null
  if (target_meters !== undefined) updates.target_meters = target_meters
  if (start_date !== undefined) updates.start_date = start_date
  if (end_date !== undefined) updates.end_date = end_date
  if (challenge_type !== undefined) updates.challenge_type = challenge_type
  if (config !== undefined) updates.config = config

  const { data, error } = await supabaseAdmin
    .from('group_challenges')
    .update(updates)
    .eq('id', challengeId)
    .eq('group_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

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
