import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { cookies } from 'next/headers'

// ── GET /api/groups/[id]/messages ─────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: messages, error } = await supabaseAdmin
    .from('group_messages')
    .select('id, from_athlete_id, to_athlete_id, content, created_at')
    .eq('group_id', params.id)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!messages?.length) return NextResponse.json({ messages: [] })

  // Resolve names for all athletes referenced
  const athleteIds = Array.from(
    new Set([
      ...messages.map(m => m.from_athlete_id),
      ...messages.filter(m => m.to_athlete_id).map(m => m.to_athlete_id!),
    ])
  )

  const { data: tokens } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id, athlete_name, athlete_profile')
    .in('athlete_id', athleteIds)

  const nameMap = Object.fromEntries(
    (tokens ?? []).map(t => [t.athlete_id, { name: t.athlete_name, profile_pic: t.athlete_profile ?? null }])
  )

  const meId = parseInt(athleteId)

  const enriched = messages.map(m => ({
    id: m.id,
    from_athlete_id: m.from_athlete_id,
    from_name: nameMap[m.from_athlete_id]?.name ?? `Athlete ${m.from_athlete_id}`,
    from_pic: nameMap[m.from_athlete_id]?.profile_pic ?? null,
    to_athlete_id: m.to_athlete_id ?? null,
    to_name: m.to_athlete_id ? (nameMap[m.to_athlete_id]?.name ?? `Athlete ${m.to_athlete_id}`) : null,
    content: m.content,
    created_at: m.created_at,
    is_mine: m.from_athlete_id === meId,
  }))

  return NextResponse.json({ messages: enriched })
}

// ── POST /api/groups/[id]/messages ────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json()
  const { content, to_athlete_id } = body

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
  }
  if (content.length > 500) {
    return NextResponse.json({ error: 'Message too long (max 500 chars)' }, { status: 400 })
  }

  const { data: message, error } = await supabaseAdmin
    .from('group_messages')
    .insert({
      group_id: params.id,
      from_athlete_id: parseInt(athleteId),
      to_athlete_id: to_athlete_id ?? null,
      content: content.trim(),
    })
    .select('id, from_athlete_id, to_athlete_id, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(message)
}

// ── DELETE /api/groups/[id]/messages ─────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const messageId = searchParams.get('messageId')
  if (!messageId) return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })

  // Only the sender or a group admin can delete
  const { data: msg } = await supabaseAdmin
    .from('group_messages')
    .select('from_athlete_id')
    .eq('id', messageId)
    .eq('group_id', params.id)
    .maybeSingle()

  if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })

  const meId = parseInt(athleteId)
  if (msg.from_athlete_id !== meId && membership.role !== 'admin') {
    return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('group_messages')
    .delete()
    .eq('id', messageId)
    .eq('group_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
