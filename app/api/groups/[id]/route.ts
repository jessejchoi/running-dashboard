import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Verify caller is a member
  const { data: myMembership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!myMembership) return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })

  // Fetch group
  const { data: group, error: grpErr } = await supabaseAdmin
    .from('groups')
    .select('*')
    .eq('id', params.id)
    .single()

  if (grpErr) return NextResponse.json({ error: grpErr.message }, { status: 500 })

  // Fetch all members
  const { data: members } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id, role, joined_at')
    .eq('group_id', params.id)
    .order('joined_at', { ascending: true })

  const memberAthleteIds = (members ?? []).map(m => m.athlete_id)

  // Fetch strava profile info (name, profile pic) for each member
  const { data: tokens } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id, athlete_name, athlete_profile')
    .in('athlete_id', memberAthleteIds)

  // Fetch goals for all members
  const { data: goals } = await supabaseAdmin
    .from('user_goals')
    .select('athlete_id, id, distance_key, label, target_secs, current_secs, race_date')
    .in('athlete_id', memberAthleteIds)
    .order('race_date', { ascending: true })

  // Compose member profiles
  const memberProfiles = (members ?? []).map(m => {
    const token = tokens?.find(t => t.athlete_id === m.athlete_id)
    const memberGoals = (goals ?? []).filter(g => g.athlete_id === m.athlete_id)
    return {
      athlete_id: m.athlete_id,
      role: m.role,
      joined_at: m.joined_at,
      name: token?.athlete_name ?? `Athlete ${m.athlete_id}`,
      profile_pic: token?.athlete_profile ?? null,
      goals: memberGoals,
      is_me: m.athlete_id === parseInt(athleteId),
    }
  })

  return NextResponse.json({
    ...group,
    my_role: myMembership.role,
    members: memberProfiles,
  })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Only admin can delete
  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (membership?.role !== 'admin') {
    return NextResponse.json({ error: 'Only the group admin can delete the group' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('groups')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
