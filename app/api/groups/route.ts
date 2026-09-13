import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET() {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Get all group_ids this athlete belongs to
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from('group_members')
    .select('group_id, role, joined_at')
    .eq('athlete_id', parseInt(athleteId))

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  if (!memberships?.length) return NextResponse.json([])

  const groupIds = memberships.map(m => m.group_id)

  // Fetch group details
  const { data: groups, error: grpErr } = await supabaseAdmin
    .from('groups')
    .select('*')
    .in('id', groupIds)
    .order('created_at', { ascending: true })

  if (grpErr) return NextResponse.json({ error: grpErr.message }, { status: 500 })

  // Fetch member counts
  const { data: allMembers } = await supabaseAdmin
    .from('group_members')
    .select('group_id, athlete_id')
    .in('group_id', groupIds)

  const memberCounts: Record<string, number> = {}
  for (const m of allMembers ?? []) {
    memberCounts[m.group_id] = (memberCounts[m.group_id] ?? 0) + 1
  }

  const result = (groups ?? []).map(g => ({
    ...g,
    member_count: memberCounts[g.id] ?? 1,
    my_role: memberships.find(m => m.group_id === g.id)?.role ?? 'member',
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Group name required' }, { status: 400 })

  // Check group limit
  const { count } = await supabaseAdmin
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', parseInt(athleteId))

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'You can be in a maximum of 3 groups' }, { status: 400 })
  }

  // Create group
  const { data: group, error: grpErr } = await supabaseAdmin
    .from('groups')
    .insert({ name: name.trim(), created_by: parseInt(athleteId) })
    .select()
    .single()

  if (grpErr) return NextResponse.json({ error: grpErr.message }, { status: 500 })

  // Add creator as admin member
  const { error: memErr } = await supabaseAdmin
    .from('group_members')
    .insert({ group_id: group.id, athlete_id: parseInt(athleteId), role: 'admin' })

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  return NextResponse.json({ ...group, member_count: 1, my_role: 'admin' })
}
