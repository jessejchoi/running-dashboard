import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

async function getCallerRole(groupId: string, athleteId: number) {
  const { data } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('athlete_id', athleteId)
    .maybeSingle()
  return data?.role ?? null
}

// PATCH — update a member's role (promote to admin / demote to member)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const callerIdStr = await getAthleteId()
  if (!callerIdStr) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const callerId = parseInt(callerIdStr)

  const callerRole = await getCallerRole(params.id, callerId)
  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Only admins can update member roles' }, { status: 403 })
  }

  const { athlete_id: targetId, role } = await req.json()
  if (!targetId || !['admin', 'member'].includes(role)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (targetId === callerId) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('group_members')
    .update({ role })
    .eq('group_id', params.id)
    .eq('athlete_id', targetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — kick a member from the group
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const callerIdStr = await getAthleteId()
  if (!callerIdStr) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const callerId = parseInt(callerIdStr)

  const callerRole = await getCallerRole(params.id, callerId)
  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Only admins can remove members' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const targetIdStr = searchParams.get('athleteId')
  if (!targetIdStr) return NextResponse.json({ error: 'athleteId required' }, { status: 400 })
  const targetId = parseInt(targetIdStr)

  if (targetId === callerId) {
    return NextResponse.json({ error: 'Cannot kick yourself — use leave instead' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('group_members')
    .delete()
    .eq('group_id', params.id)
    .eq('athlete_id', targetId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
