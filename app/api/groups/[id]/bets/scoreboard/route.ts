import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildBetScoreboard, type BetForScoreboard, type BetPositionLike } from '@/lib/groupBets'

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

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const [{ data: betsRaw }, { data: membersRaw }] = await Promise.all([
    supabaseAdmin
      .from('group_bets')
      .select('*')
      .eq('group_id', params.id),
    supabaseAdmin
      .from('group_members')
      .select('athlete_id')
      .eq('group_id', params.id),
  ])

  const bets = (betsRaw ?? []) as BetForScoreboard[]
  const betIds = bets.map(b => b.id)
  const { data: positionsRaw } = betIds.length > 0
    ? await supabaseAdmin
      .from('group_bet_positions')
      .select('bet_id, athlete_id, side, pledge_cents')
      .in('bet_id', betIds)
    : { data: [] }

  const positionsByBet = (positionsRaw ?? []).reduce<Record<string, BetPositionLike[]>>((acc, pos) => {
    acc[pos.bet_id] = [...(acc[pos.bet_id] ?? []), {
      athlete_id: pos.athlete_id,
      side: pos.side,
      pledge_cents: pos.pledge_cents,
    }]
    return acc
  }, {})

  const scoreboard = buildBetScoreboard(bets, positionsByBet)
  const memberIds = Array.from(new Set([
    ...(membersRaw ?? []).map(m => m.athlete_id as number),
    ...scoreboard.members.map(m => m.athlete_id),
    ...(scoreboard.mostBackedAthleteId ? [scoreboard.mostBackedAthleteId] : []),
    ...(scoreboard.mostDoubtedAthleteId ? [scoreboard.mostDoubtedAthleteId] : []),
  ]))

  const { data: tokens } = memberIds.length > 0
    ? await supabaseAdmin
      .from('strava_tokens')
      .select('athlete_id, athlete_name, athlete_profile')
      .in('athlete_id', memberIds)
    : { data: [] }

  const tokenMap = Object.fromEntries(
    (tokens ?? []).map(t => [t.athlete_id, { name: t.athlete_name, profile_pic: t.athlete_profile ?? null }])
  )

  return NextResponse.json({
    ...scoreboard,
    members: scoreboard.members.map(row => ({
      ...row,
      athlete_name: tokenMap[row.athlete_id]?.name ?? `Athlete ${row.athlete_id}`,
      athlete_profile: tokenMap[row.athlete_id]?.profile_pic ?? null,
      is_me: row.athlete_id === athleteId,
    })),
    bestPredictor: scoreboard.bestPredictor ? {
      ...scoreboard.bestPredictor,
      athlete_name: tokenMap[scoreboard.bestPredictor.athlete_id]?.name ?? `Athlete ${scoreboard.bestPredictor.athlete_id}`,
      athlete_profile: tokenMap[scoreboard.bestPredictor.athlete_id]?.profile_pic ?? null,
    } : null,
    mostBackedAthlete: scoreboard.mostBackedAthleteId ? {
      athlete_id: scoreboard.mostBackedAthleteId,
      athlete_name: tokenMap[scoreboard.mostBackedAthleteId]?.name ?? `Athlete ${scoreboard.mostBackedAthleteId}`,
      athlete_profile: tokenMap[scoreboard.mostBackedAthleteId]?.profile_pic ?? null,
    } : null,
    mostDoubtedAthlete: scoreboard.mostDoubtedAthleteId ? {
      athlete_id: scoreboard.mostDoubtedAthleteId,
      athlete_name: tokenMap[scoreboard.mostDoubtedAthleteId]?.name ?? `Athlete ${scoreboard.mostDoubtedAthleteId}`,
      athlete_profile: tokenMap[scoreboard.mostDoubtedAthleteId]?.profile_pic ?? null,
    } : null,
  })
}
