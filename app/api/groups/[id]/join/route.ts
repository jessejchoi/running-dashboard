import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // Verify the group exists
  const { data: group, error: grpErr } = await supabaseAdmin
    .from('groups')
    .select('id, name')
    .eq('id', params.id)
    .single()

  if (grpErr || !group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // Check if already a member
  const { data: existing } = await supabaseAdmin
    .from('group_members')
    .select('id')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, already_member: true, group_id: params.id })
  }

  // Check group limit
  const { count } = await supabaseAdmin
    .from('group_members')
    .select('*', { count: 'exact', head: true })
    .eq('athlete_id', parseInt(athleteId))

  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: 'You can be in a maximum of 3 groups' }, { status: 400 })
  }

  // Join
  const { error: memErr } = await supabaseAdmin
    .from('group_members')
    .insert({ group_id: params.id, athlete_id: parseInt(athleteId), role: 'member' })

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, already_member: false, group_id: params.id, group_name: group.name })
}
