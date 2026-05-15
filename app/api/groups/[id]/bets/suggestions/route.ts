import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { defaultWeekWindow } from '@/lib/groupBets'
import { parseTime, type DistanceKey } from '@/lib/goals'

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

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function ymd(date: Date) {
  return date.toISOString().slice(0, 10)
}

function roundUpKm(meters: number) {
  return Math.max(5, Math.ceil(meters / 1000 / 5) * 5)
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { athleteId, membership } = await getMembership(params.id)
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const today = new Date()
  const week = defaultWeekWindow(today)
  const nextWeekEnd = ymd(addDays(today, 7))

  const { data: memberRows } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', params.id)

  const memberIds = (memberRows ?? []).map(m => m.athlete_id as number)
  if (memberIds.length === 0) return NextResponse.json({ suggestions: [] })

  const [
    { data: tokens },
    { data: activities },
    { data: plans },
    { data: goals },
    { data: openBets },
  ] = await Promise.all([
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_id, athlete_name, athlete_profile')
      .in('athlete_id', memberIds),
    supabaseAdmin
      .from('activities')
      .select('athlete_id, start_date, distance, type')
      .in('athlete_id', memberIds)
      .gte('start_date', `${week.start}T00:00:00.000Z`)
      .eq('type', 'Run'),
    supabaseAdmin
      .from('user_plans')
      .select('athlete_id, plan_date, session_index, session_type, description, target_distance_meters')
      .in('athlete_id', memberIds)
      .gte('plan_date', ymd(today))
      .lte('plan_date', nextWeekEnd)
      .order('plan_date', { ascending: true }),
    supabaseAdmin
      .from('user_goals')
      .select('athlete_id, distance_key, target_secs, race_date')
      .in('athlete_id', memberIds)
      .gte('race_date', ymd(today)),
    supabaseAdmin
      .from('group_bets')
      .select('target_athlete_id, metric_type, status')
      .eq('group_id', params.id)
      .in('status', ['open', 'locked']),
  ])

  const tokenMap = Object.fromEntries(
    (tokens ?? []).map(t => [t.athlete_id, { name: t.athlete_name as string, profile_pic: t.athlete_profile as string | null }])
  )

  const hasOpen = (athleteId: number, metricType: string) =>
    (openBets ?? []).some(b => b.target_athlete_id === athleteId && b.metric_type === metricType)

  const suggestions: Array<Record<string, unknown>> = []

  for (const athleteIdNum of memberIds) {
    const name = tokenMap[athleteIdNum]?.name ?? `Athlete ${athleteIdNum}`
    const first = name.split(' ')[0]
    const weekRuns = (activities ?? []).filter(a => a.athlete_id === athleteIdNum)
    const weekMeters = weekRuns.reduce((sum, a) => sum + (a.distance ?? 0), 0)

    if (!hasOpen(athleteIdNum, 'weekly_distance') && weekMeters >= 30_000 && weekMeters < 100_000) {
      const targetKm = Math.max(50, roundUpKm(weekMeters + 20_000))
      suggestions.push({
        id: `weekly-${athleteIdNum}`,
        title: `${first} over ${targetKm} km this week`,
        reason: `${first} already has ${(weekMeters / 1000).toFixed(1)} km logged this week.`,
        template: {
          mode: 'pool',
          target_athlete_id: athleteIdNum,
          metric_type: 'weekly_distance',
          comparator: 'gte',
          target_value_km: targetKm,
          window_start: week.start,
          window_end: week.end,
          creator_side: 'for',
          pledge_amount: 20,
        },
      })
    }

    const planned = (plans ?? []).find(p =>
      p.athlete_id === athleteIdNum &&
      (p.target_distance_meters ?? 0) >= 10_000 &&
      p.session_type !== 'rest'
    )
    if (planned && !hasOpen(athleteIdNum, 'planned_session')) {
      suggestions.push({
        id: `plan-${athleteIdNum}-${planned.plan_date}-${planned.session_index}`,
        title: `${first} completes the planned ${Math.round((planned.target_distance_meters ?? 0) / 1000)} km`,
        reason: `${first} has a planned session on ${planned.plan_date}.`,
        template: {
          mode: 'pool',
          target_athlete_id: athleteIdNum,
          metric_type: 'planned_session',
          comparator: 'gte',
          target_value_km: Math.round((planned.target_distance_meters ?? 0) / 1000),
          window_start: planned.plan_date,
          window_end: planned.plan_date,
          creator_side: 'for',
          pledge_amount: 20,
          config: {
            plan_date: planned.plan_date,
            session_index: planned.session_index,
            session_type: planned.session_type,
            description: planned.description,
          },
        },
      })
    }

    const nextGoal = (goals ?? []).find(g => g.athlete_id === athleteIdNum && ['5k', '10k', 'hm', 'fm'].includes(g.distance_key))
    if (nextGoal && !hasOpen(athleteIdNum, 'race_time')) {
      suggestions.push({
        id: `race-${athleteIdNum}-${nextGoal.distance_key}`,
        title: `${first} hits ${nextGoal.distance_key.toUpperCase()} goal pace`,
        reason: `${first} has a ${nextGoal.distance_key.toUpperCase()} goal on the board.`,
        template: {
          mode: 'pool',
          target_athlete_id: athleteIdNum,
          metric_type: 'race_time',
          comparator: 'lte',
          distance_key: nextGoal.distance_key as DistanceKey,
          target_time: nextGoal.target_secs ? `${Math.floor(nextGoal.target_secs / 60)}:${String(nextGoal.target_secs % 60).padStart(2, '0')}` : '45:00',
          target_secs: nextGoal.target_secs ?? parseTime('45:00'),
          window_start: ymd(today),
          window_end: nextGoal.race_date,
          creator_side: 'for',
          pledge_amount: 20,
        },
      })
    }

    if (!hasOpen(athleteIdNum, 'run_count') && weekRuns.length === 0) {
      suggestions.push({
        id: `count-${athleteIdNum}`,
        title: `${first} gets three runs in this week`,
        reason: `${first} has not logged a run yet this week.`,
        template: {
          mode: 'pool',
          target_athlete_id: athleteIdNum,
          metric_type: 'run_count',
          comparator: 'gte',
          target_value: 3,
          window_start: week.start,
          window_end: week.end,
          creator_side: 'for',
          pledge_amount: 20,
        },
      })
    }
  }

  return NextResponse.json({ suggestions: suggestions.slice(0, 6) })
}
