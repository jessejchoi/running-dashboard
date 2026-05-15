import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'

async function getMembership(groupId: string) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return { athleteId: null, membership: null as { role: string } | null }

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  return { athleteId: parseInt(athleteId), membership: membership as { role: string } | null }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json()
  const betId = typeof body.bet_id === 'string' ? body.bet_id : null
  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (!betId || !content) return NextResponse.json({ error: 'Missing comment' }, { status: 400 })
  if (content.length > 280) return NextResponse.json({ error: 'Comments are capped at 280 characters' }, { status: 400 })

  const { data: bet } = await supabaseAdmin
    .from('group_bets')
    .select('id')
    .eq('id', betId)
    .eq('group_id', params.id)
    .maybeSingle()

  if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

  const { data, error } = await supabaseAdmin
    .from('group_bet_comments')
    .insert({
      group_id: params.id,
      bet_id: betId,
      author_athlete_id: athleteId,
      content,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const commentId = searchParams.get('commentId')
  if (!commentId) return NextResponse.json({ error: 'Missing comment id' }, { status: 400 })

  const { data: comment } = await supabaseAdmin
    .from('group_bet_comments')
    .select('id, author_athlete_id')
    .eq('id', commentId)
    .eq('group_id', params.id)
    .maybeSingle()

  if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  if (comment.author_athlete_id !== athleteId && membership.role !== 'admin') {
    return NextResponse.json({ error: 'You cannot delete this comment' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('group_bet_comments')
    .delete()
    .eq('id', commentId)
    .eq('group_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
