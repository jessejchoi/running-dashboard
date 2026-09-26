import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { claudeMessage } from '@/lib/claude'
import { localDate, weekStart } from '@/lib/calendar'
import { athleteTimezone } from '@/lib/timezone'

const PEEK_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export interface PeekContent {
  rank: number
  total: number
  week_km: number
  coach_line: string
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const numericAthleteId = parseInt(athleteId)

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', numericAthleteId)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Check peek cache
  const { data: briefingRow } = await supabaseAdmin
    .from('group_coach_briefings')
    .select('peek_cache_json, peek_generated_at')
    .eq('group_id', params.id)
    .maybeSingle()

  if (briefingRow?.peek_cache_json && briefingRow?.peek_generated_at) {
    const age = Date.now() - new Date(briefingRow.peek_generated_at).getTime()
    if (age < PEEK_CACHE_TTL_MS) {
      return NextResponse.json({ ...(briefingRow.peek_cache_json as PeekContent), cached: true })
    }
  }

  // Compute fresh peek data
  // Get all members and their this-week distances
  // This week in the viewer's zone; runs count on the local day they were run.
  const thisWeek = weekStart(localDate(new Date(), await athleteTimezone(numericAthleteId)))

  const { data: groupMembers } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', params.id)

  const memberIds = (groupMembers ?? []).map(m => m.athlete_id)
  if (memberIds.length === 0) {
    return NextResponse.json({ error: 'No members found' }, { status: 404 })
  }

  const { data: weekRuns } = await supabaseAdmin
    .from('activities')
    .select('athlete_id, distance')
    .in('athlete_id', memberIds)
    .gte('start_date_local', thisWeek)

  const distByMember: Record<number, number> = {}
  for (const r of weekRuns ?? []) {
    distByMember[r.athlete_id] = (distByMember[r.athlete_id] ?? 0) + r.distance
  }

  const board = memberIds
    .map(id => ({ athlete_id: id, km: parseFloat(((distByMember[id] ?? 0) / 1000).toFixed(1)) }))
    .sort((a, b) => b.km - a.km)

  const myEntry = board.find(e => e.athlete_id === numericAthleteId)
  const rank = board.findIndex(e => e.athlete_id === numericAthleteId) + 1
  const total = board.length
  const week_km = myEntry?.km ?? 0

  // Get names for coach context
  const { data: tokens } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id, athlete_name')
    .in('athlete_id', memberIds)
  const nameMap = Object.fromEntries((tokens ?? []).map(t => [t.athlete_id, t.athlete_name.split(' ')[0]]))

  const boardSummary = board.map((e, i) => `#${i + 1} ${nameMap[e.athlete_id] ?? 'Unknown'}: ${e.km}km`).join(', ')
  const myName = nameMap[numericAthleteId] ?? 'You'

  let coach_line: string
  try {
    coach_line = await claudeMessage({
      model: 'claude-haiku-4-5-20251001',
      system: 'You are RDCoach. Write ONE short, snarky, specific sentence about this athlete\'s group standing this week. Max 20 words. No punctuation at the very end unless it\'s a question mark. Direct address to the athlete.',
      messages: [{
        role: 'user',
        content: `${myName} is ranked #${rank} of ${total} this week with ${week_km}km. Leaderboard: ${boardSummary}.`,
      }],
      max_tokens: 60,
    })
  } catch {
    coach_line = rank === 1
      ? 'Top of the board. Don\'t let it go to your head.'
      : `${total - rank} people ahead of you. You know what to do.`
  }

  const peek: PeekContent = { rank, total, week_km, coach_line }

  // Cache it
  await supabaseAdmin
    .from('group_coach_briefings')
    .upsert({
      group_id: params.id,
      peek_cache_json: peek,
      peek_generated_at: new Date().toISOString(),
    }, { onConflict: 'group_id' })

  return NextResponse.json({ ...peek, cached: false })
}
