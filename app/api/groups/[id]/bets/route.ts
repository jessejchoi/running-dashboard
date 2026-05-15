import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import {
  defaultWeekWindow,
  isDistanceKey,
  resolveBetOutcome,
  type BetActivity,
  type BetComparator,
  type BetCore,
  type BetMetricType,
  type BetMode,
  type BetSide,
} from '@/lib/groupBets'

type Membership = { role: string } | null

async function getMembership(groupId: string) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return { athleteId: null, membership: null as Membership }

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  return { athleteId: parseInt(athleteId), membership: membership as Membership }
}

function isValidSide(side: unknown): side is BetSide {
  return side === 'for' || side === 'against'
}

function isValidMode(mode: unknown): mode is BetMode {
  return mode === 'direct' || mode === 'pool'
}

function isValidMetric(metric: unknown): metric is BetMetricType {
  return metric === 'weekly_distance' || metric === 'distance' || metric === 'run_count' || metric === 'longest_run' || metric === 'race_time' || metric === 'planned_session'
}

function isValidComparator(comparator: unknown): comparator is BetComparator {
  return comparator === 'gte' || comparator === 'lte'
}

function normalizeDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function isPastWindow(endDate: string) {
  return new Date(`${endDate}T23:59:59.999Z`).getTime() < Date.now()
}

async function fetchGroupMemberIds(groupId: string) {
  const { data: members } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', groupId)

  return (members ?? []).map(m => m.athlete_id as number)
}

async function fetchBetActivities(memberIds: number[], minStart: string) {
  if (memberIds.length === 0) return []
  const { data } = await supabaseAdmin
    .from('activities')
    .select('id, athlete_id, name, start_date, distance, moving_time, matched_distance_key')
    .in('athlete_id', memberIds)
    .gte('start_date', `${minStart}T00:00:00.000Z`)
    .eq('type', 'Run')

  return (data ?? []) as BetActivity[]
}

async function emitBetEvent(params: {
  groupId: string
  betId: string | null
  actorAthleteId: number | null
  eventType: 'created' | 'joined' | 'accepted' | 'declined' | 'resolved' | 'voided' | 'deleted' | 'coach_suggested'
  payload?: Record<string, unknown>
}) {
  await supabaseAdmin
    .from('group_bet_events')
    .insert({
      group_id: params.groupId,
      bet_id: params.betId,
      actor_athlete_id: params.actorAthleteId,
      event_type: params.eventType,
      payload: params.payload ?? {},
    })
}

async function resolveEligibleBets(groupId: string, bets: any[], positionsByBet: Record<string, any[]>, activities: BetActivity[]) {
  const updates: Record<string, any> = {}

  for (const bet of bets) {
    if (!['open', 'locked'].includes(bet.status)) continue

    const positions = positionsByBet[bet.id] ?? []
    if (!isPastWindow(bet.window_end)) continue

    if (positions.length < 2) {
      updates[bet.id] = {
        ...(updates[bet.id] ?? {}),
        status: 'void',
        resolved_at: new Date().toISOString(),
        resolution: { reason: 'not_enough_participants' },
      }
      await emitBetEvent({
        groupId,
        betId: bet.id,
        actorAthleteId: null,
        eventType: 'voided',
        payload: { reason: 'not_enough_participants' },
      })
      continue
    }

    const outcome = resolveBetOutcome(bet as BetCore, activities)
    const creatorWon = bet.creator_side === outcome.winningSide
    updates[bet.id] = {
      ...(updates[bet.id] ?? {}),
      status: creatorWon ? 'won' : 'lost',
      outcome_achieved: outcome.achieved,
      winning_side: outcome.winningSide,
      best_activity_id: outcome.bestActivityId,
      resolved_at: new Date().toISOString(),
      resolution: {
        current_value: outcome.currentValue,
        evidence_label: outcome.evidenceLabel,
        best_activity_id: outcome.bestActivityId,
        attempts: outcome.attempts ?? [],
        contributing_activities: outcome.contributingActivities ?? [],
      },
    }
    await emitBetEvent({
      groupId,
      betId: bet.id,
      actorAthleteId: null,
      eventType: 'resolved',
      payload: {
        achieved: outcome.achieved,
        winning_side: outcome.winningSide,
        evidence_label: outcome.evidenceLabel,
        best_activity_id: outcome.bestActivityId,
      },
    })
  }

  for (const [id, update] of Object.entries(updates)) {
    await supabaseAdmin
      .from('group_bets')
      .update(update)
      .eq('id', id)
      .eq('group_id', groupId)
  }

  return bets.map(bet => updates[bet.id] ? { ...bet, ...updates[bet.id] } : bet)
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: betsRaw, error } = await supabaseAdmin
    .from('group_bets')
    .select('*')
    .eq('group_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bets = betsRaw ?? []
  if (bets.length === 0) return NextResponse.json({ bets: [] })

  const betIds = bets.map(b => b.id as string)
  const [{ data: positionsRaw }, memberIds] = await Promise.all([
    supabaseAdmin
      .from('group_bet_positions')
      .select('*')
      .in('bet_id', betIds)
      .order('created_at', { ascending: true }),
    fetchGroupMemberIds(params.id),
  ])

  const positions = positionsRaw ?? []
  const positionsByBet = positions.reduce<Record<string, any[]>>((acc, pos) => {
    acc[pos.bet_id] = [...(acc[pos.bet_id] ?? []), pos]
    return acc
  }, {})

  const minStart = bets.reduce((min, bet) => bet.window_start < min ? bet.window_start : min, bets[0].window_start as string)
  const activities = await fetchBetActivities(memberIds, minStart)
  const resolvedBets = await resolveEligibleBets(params.id, bets, positionsByBet, activities)

  const participantIds = Array.from(new Set([
    ...memberIds,
    ...resolvedBets.map(b => b.creator_athlete_id as number),
    ...resolvedBets.map(b => b.target_athlete_id as number),
    ...positions.map(p => p.athlete_id as number),
  ]))

  const { data: tokens } = participantIds.length > 0
    ? await supabaseAdmin
      .from('strava_tokens')
      .select('athlete_id, athlete_name, athlete_profile')
      .in('athlete_id', participantIds)
    : { data: [] }

  const tokenMap = Object.fromEntries(
    (tokens ?? []).map(t => [t.athlete_id, { name: t.athlete_name, profile_pic: t.athlete_profile ?? null }])
  )

  const [{ data: eventsRaw }, { data: commentsRaw }] = await Promise.all([
    supabaseAdmin
      .from('group_bet_events')
      .select('*')
      .eq('group_id', params.id)
      .order('created_at', { ascending: false })
      .limit(30),
    supabaseAdmin
      .from('group_bet_comments')
      .select('*')
      .eq('group_id', params.id)
      .in('bet_id', betIds)
      .order('created_at', { ascending: true }),
  ])

  const commentsByBet = (commentsRaw ?? []).reduce<Record<string, any[]>>((acc, comment) => {
    acc[comment.bet_id] = [...(acc[comment.bet_id] ?? []), comment]
    return acc
  }, {})

  const enriched = resolvedBets.map(bet => {
    const outcome = resolveBetOutcome(bet as BetCore, activities)
    const betPositions = positionsByBet[bet.id] ?? []
    return {
      ...bet,
      creator_name: tokenMap[bet.creator_athlete_id]?.name ?? `Athlete ${bet.creator_athlete_id}`,
      creator_profile: tokenMap[bet.creator_athlete_id]?.profile_pic ?? null,
      target_name: tokenMap[bet.target_athlete_id]?.name ?? `Athlete ${bet.target_athlete_id}`,
      target_profile: tokenMap[bet.target_athlete_id]?.profile_pic ?? null,
      is_creator: bet.creator_athlete_id === athleteId,
      is_target: bet.target_athlete_id === athleteId,
      my_position: betPositions.find(p => p.athlete_id === athleteId) ?? null,
      positions: betPositions.map(pos => ({
        ...pos,
        athlete_name: tokenMap[pos.athlete_id]?.name ?? `Athlete ${pos.athlete_id}`,
        athlete_profile: tokenMap[pos.athlete_id]?.profile_pic ?? null,
        is_me: pos.athlete_id === athleteId,
      })),
      comments: (commentsByBet[bet.id] ?? []).map(comment => ({
        ...comment,
        author_name: tokenMap[comment.author_athlete_id]?.name ?? `Athlete ${comment.author_athlete_id}`,
        author_profile: tokenMap[comment.author_athlete_id]?.profile_pic ?? null,
        is_mine: comment.author_athlete_id === athleteId,
      })),
      live_result: outcome,
    }
  })

  return NextResponse.json({
    bets: enriched,
    events: (eventsRaw ?? []).map(event => ({
      ...event,
      actor_name: event.actor_athlete_id ? tokenMap[event.actor_athlete_id]?.name ?? `Athlete ${event.actor_athlete_id}` : null,
      actor_profile: event.actor_athlete_id ? tokenMap[event.actor_athlete_id]?.profile_pic ?? null : null,
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json()
  const mode = isValidMode(body.mode) ? body.mode : null
  const metricType = isValidMetric(body.metric_type) ? body.metric_type : null
  const comparator = isValidComparator(body.comparator) ? body.comparator : null
  const creatorSide = isValidSide(body.creator_side) ? body.creator_side : null
  const targetAthleteId = Number(body.target_athlete_id)
  const pledgeCents = Math.round(Number(body.pledge_amount) * 100)

  const week = defaultWeekWindow()
  const windowStart = metricType === 'weekly_distance'
    ? normalizeDate(body.window_start) ?? week.start
    : normalizeDate(body.window_start)
  const windowEnd = metricType === 'weekly_distance'
    ? normalizeDate(body.window_end) ?? week.end
    : normalizeDate(body.window_end)

  if (!mode || !metricType || !comparator || !creatorSide || !Number.isFinite(targetAthleteId) || !windowStart || !windowEnd) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (new Date(windowEnd) < new Date(windowStart)) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 400 })
  }
  if (!Number.isFinite(pledgeCents) || pledgeCents <= 0) {
    return NextResponse.json({ error: 'Enter a pledge amount greater than 0' }, { status: 400 })
  }

  const memberIds = await fetchGroupMemberIds(params.id)
  if (!memberIds.includes(targetAthleteId)) {
    return NextResponse.json({ error: 'Target athlete must be in the group' }, { status: 400 })
  }
  if (mode === 'direct' && targetAthleteId === athleteId) {
    return NextResponse.json({ error: 'Direct bets need another member' }, { status: 400 })
  }

  let targetValue: number | null = null
  let distanceKey: string | null = null
  let targetSecs: number | null = null

  if (metricType === 'race_time') {
    if (!isDistanceKey(body.distance_key) || !Number.isFinite(Number(body.target_secs)) || Number(body.target_secs) <= 0) {
      return NextResponse.json({ error: 'Choose a race distance and valid target time' }, { status: 400 })
    }
    distanceKey = body.distance_key
    targetSecs = Math.round(Number(body.target_secs))
  } else {
    const rawTarget = Number(body.target_value)
    if (!Number.isFinite(rawTarget) || rawTarget <= 0) {
      return NextResponse.json({ error: 'Enter a valid target value' }, { status: 400 })
    }
    targetValue = metricType === 'run_count' ? Math.round(rawTarget) : rawTarget
  }

  const { data: bet, error } = await supabaseAdmin
    .from('group_bets')
    .insert({
      group_id: params.id,
      creator_athlete_id: athleteId,
      mode,
      target_athlete_id: targetAthleteId,
      metric_type: metricType,
      comparator,
      target_value: targetValue,
      distance_key: distanceKey,
      target_secs: targetSecs,
      window_start: windowStart,
      window_end: windowEnd,
      pledge_cents: pledgeCents,
      currency: 'USD',
      creator_side: creatorSide,
      status: 'open',
      config: typeof body.config === 'object' && body.config !== null ? body.config : {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { error: posError } = await supabaseAdmin
    .from('group_bet_positions')
    .insert({
      bet_id: bet.id,
      athlete_id: athleteId,
      side: creatorSide,
      pledge_cents: pledgeCents,
      accepted_at: new Date().toISOString(),
    })

  if (posError) return NextResponse.json({ error: posError.message }, { status: 500 })

  await emitBetEvent({
    groupId: params.id,
    betId: bet.id,
    actorAthleteId: athleteId,
    eventType: 'created',
    payload: {
      mode,
      metric_type: metricType,
      target_athlete_id: targetAthleteId,
      creator_side: creatorSide,
      pledge_cents: pledgeCents,
    },
  })

  return NextResponse.json(bet)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json()
  const action = body.action
  const betId = typeof body.bet_id === 'string' ? body.bet_id : null
  if (!betId) return NextResponse.json({ error: 'Missing bet id' }, { status: 400 })

  const { data: bet } = await supabaseAdmin
    .from('group_bets')
    .select('*')
    .eq('id', betId)
    .eq('group_id', params.id)
    .maybeSingle()

  if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

  if (action === 'join' || action === 'accept') {
    if (bet.status !== 'open' && !(bet.status === 'locked' && bet.mode === 'direct' && action === 'accept')) {
      return NextResponse.json({ error: 'This bet is no longer accepting participants' }, { status: 400 })
    }

    const side = action === 'accept'
      ? (bet.creator_side === 'for' ? 'against' : 'for')
      : isValidSide(body.side) ? body.side : null

    if (!side) return NextResponse.json({ error: 'Choose a side' }, { status: 400 })
    if (bet.mode === 'direct' && athleteId !== bet.target_athlete_id) {
      return NextResponse.json({ error: 'Only the target can accept this direct bet' }, { status: 403 })
    }
    if (bet.creator_athlete_id === athleteId) {
      return NextResponse.json({ error: 'You are already in this bet' }, { status: 400 })
    }

    const pledgeCents = Math.round(Number(body.pledge_amount ?? bet.pledge_cents / 100) * 100)
    if (!Number.isFinite(pledgeCents) || pledgeCents <= 0) {
      return NextResponse.json({ error: 'Enter a pledge amount greater than 0' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('group_bet_positions')
      .upsert({
        bet_id: bet.id,
        athlete_id: athleteId,
        side,
        pledge_cents: pledgeCents,
        accepted_at: new Date().toISOString(),
      }, { onConflict: 'bet_id,athlete_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await emitBetEvent({
      groupId: params.id,
      betId: bet.id,
      actorAthleteId: athleteId,
      eventType: action === 'accept' ? 'accepted' : 'joined',
      payload: { side, pledge_cents: pledgeCents },
    })

    if (bet.mode === 'direct') {
      await supabaseAdmin
        .from('group_bets')
        .update({ status: 'locked', updated_at: new Date().toISOString() })
        .eq('id', bet.id)
    }

    return NextResponse.json({ ok: true })
  }

  if (action === 'decline') {
    if (bet.mode !== 'direct' || athleteId !== bet.target_athlete_id) {
      return NextResponse.json({ error: 'Only the target can decline this direct bet' }, { status: 403 })
    }
    const { error } = await supabaseAdmin
      .from('group_bets')
      .update({
        status: 'void',
        resolved_at: new Date().toISOString(),
        resolution: { reason: 'declined', declined_by: athleteId },
        updated_at: new Date().toISOString(),
      })
      .eq('id', bet.id)
      .eq('group_id', params.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await emitBetEvent({
      groupId: params.id,
      betId: bet.id,
      actorAthleteId: athleteId,
      eventType: 'declined',
      payload: { reason: 'declined' },
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'resolve') {
    const memberIds = await fetchGroupMemberIds(params.id)
    const activities = await fetchBetActivities(memberIds, bet.window_start)
    const { data: positionsRaw } = await supabaseAdmin
      .from('group_bet_positions')
      .select('*')
      .eq('bet_id', bet.id)

    const [resolved] = await resolveEligibleBets(params.id, [bet], { [bet.id]: positionsRaw ?? [] }, activities)
    return NextResponse.json(resolved)
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const betId = searchParams.get('betId')
  if (!betId) return NextResponse.json({ error: 'Missing bet id' }, { status: 400 })

  const { data: bet } = await supabaseAdmin
    .from('group_bets')
    .select('*')
    .eq('id', betId)
    .eq('group_id', params.id)
    .maybeSingle()

  if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

  const { data: positions } = await supabaseAdmin
    .from('group_bet_positions')
    .select('athlete_id')
    .eq('bet_id', bet.id)

  const onlyCreatorJoined = (positions ?? []).every(p => p.athlete_id === athleteId)
  const canDelete = membership.role === 'admin' || (bet.creator_athlete_id === athleteId && onlyCreatorJoined)
  if (!canDelete) return NextResponse.json({ error: 'You cannot delete this bet' }, { status: 403 })

  const { error } = await supabaseAdmin
    .from('group_bets')
    .delete()
    .eq('id', bet.id)
    .eq('group_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await emitBetEvent({
    groupId: params.id,
    betId: null,
    actorAthleteId: athleteId,
    eventType: 'deleted',
    payload: { bet_id: bet.id, target_athlete_id: bet.target_athlete_id },
  })
  return NextResponse.json({ ok: true })
}
