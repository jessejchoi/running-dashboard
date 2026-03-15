import { supabaseAdmin } from '@/lib/supabase'
import { speedToPace } from '@/lib/utils'

export interface CoachContext {
  group: { name: string }
  today: string
  members: Array<{
    name: string
    goals: Array<{
      label: string
      distance_key: string
      target_secs: number
      current_secs: number | null
      days_to_race: number
    }>
    this_week_km: number
    this_month_km: number
    run_count_this_week: number
    recent_runs: Array<{
      date: string
      type: string | null
      distance_km: number
      pace_per_km: string
    }>
  }>
  active_challenges: Array<{
    name: string
    type: string
    total_km: number
    target_km: number | null
    pct: number
  }>
}

export async function buildCoachContext(groupId: string): Promise<CoachContext> {
  const today = new Date().toISOString().slice(0, 10)

  // 1. Group name
  const { data: group } = await supabaseAdmin
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single()

  // 2. Members
  const { data: memberRows } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id, role')
    .eq('group_id', groupId)

  const memberIds = (memberRows ?? []).map(m => m.athlete_id)

  const { data: tokenRows } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id, athlete_name')
    .in('athlete_id', memberIds)

  const nameMap: Record<number, string> = {}
  for (const t of tokenRows ?? []) {
    nameMap[t.athlete_id] = t.athlete_name ?? `Athlete ${t.athlete_id}`
  }

  // 3. Goals for all members
  const { data: goalRows } = await supabaseAdmin
    .from('user_goals')
    .select('athlete_id, label, distance_key, target_secs, current_secs, race_date')
    .in('athlete_id', memberIds)

  // 4. Activities last 35 days
  const cutoff = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: activityRows } = await supabaseAdmin
    .from('activities')
    .select('athlete_id, start_date, distance, moving_time, average_speed, run_type')
    .in('athlete_id', memberIds)
    .gte('start_date', cutoff + 'T00:00:00Z')
    .order('start_date', { ascending: false })
    .limit(80)

  // 5. Aggregate per-member
  const now = new Date()
  const weekStart = new Date(now)
  const day = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1))
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayDate = new Date(today + 'T00:00:00Z')

  const members = memberIds.map(athleteId => {
    const name = nameMap[athleteId] ?? `Athlete ${athleteId}`
    const goals = (goalRows ?? [])
      .filter(g => g.athlete_id === athleteId)
      .map(g => {
        const raceDate = new Date(g.race_date)
        const days_to_race = Math.ceil((raceDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24))
        return {
          label: g.label,
          distance_key: g.distance_key,
          target_secs: g.target_secs,
          current_secs: g.current_secs,
          days_to_race,
        }
      })

    const myRuns = (activityRows ?? []).filter(a => a.athlete_id === athleteId)
    const weekRuns = myRuns.filter(a => new Date(a.start_date) >= weekStart)
    const monthRuns = myRuns.filter(a => new Date(a.start_date) >= monthStart)

    const this_week_km = weekRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
    const this_month_km = monthRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
    const run_count_this_week = weekRuns.length

    const recent_runs = myRuns.slice(0, 5).map(a => ({
      date: a.start_date.slice(0, 10),
      type: a.run_type,
      distance_km: Math.round((a.distance / 1000) * 10) / 10,
      pace_per_km: speedToPace(a.average_speed, 'km'),
    }))

    return { name, goals, this_week_km: Math.round(this_week_km * 10) / 10, this_month_km: Math.round(this_month_km * 10) / 10, run_count_this_week, recent_runs }
  })

  // 6. Active challenges
  const { data: challengeRows } = await supabaseAdmin
    .from('group_challenges')
    .select('name, challenge_type, target_meters')
    .eq('group_id', groupId)
    .lte('start_date', today)
    .gte('end_date', today)

  const challengeActivities = activityRows ?? []
  const active_challenges = (challengeRows ?? []).map(c => {
    const total_km = challengeActivities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
    const target_km = c.target_meters ? c.target_meters / 1000 : null
    const pct = target_km ? Math.min(Math.round((total_km / target_km) * 100), 100) : 0
    return {
      name: c.name,
      type: c.challenge_type,
      total_km: Math.round(total_km * 10) / 10,
      target_km,
      pct,
    }
  })

  return {
    group: { name: group?.name ?? 'Group' },
    today,
    members,
    active_challenges,
  }
}
