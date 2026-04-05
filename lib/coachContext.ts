import { supabaseAdmin } from '@/lib/supabase'
import { speedToPace, computeStreak, getWeekStart, toJakartaDate } from '@/lib/utils'

export interface CoachContext {
  group: { name: string }
  today: string
  members: Array<{
    name: string
    streak: number
    goals: Array<{
      label: string
      distance_key: string
      target_secs: number
      current_secs: number | null
      days_to_race: number
    }>
    current_estimates: Array<{ distance_key: string; current_secs: number | null }>
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
    start_date: string
    end_date: string
    total_km: number
    target_km: number | null
    pct: number
  }>
}

export async function buildCoachContext(groupId: string): Promise<CoachContext> {
  const CONTEXT_BUDGET = 10
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

    const current_estimates = (goalRows ?? [])
      .filter(g => g.athlete_id === athleteId)
      .map(g => ({
        distance_key: g.distance_key,
        current_secs: g.current_secs,
      }))

    const myRuns = (activityRows ?? []).filter(a => a.athlete_id === athleteId)
    const weekRuns = myRuns.filter(a => new Date(a.start_date) >= weekStart)
    const monthRuns = myRuns.filter(a => new Date(a.start_date) >= monthStart)

    const this_week_km = weekRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
    const this_month_km = monthRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
    const run_count_this_week = weekRuns.length

    const streak = computeStreak(activityRows ?? [], athleteId)

    const recent_runs = myRuns.slice(0, CONTEXT_BUDGET).map(a => ({
      date: a.start_date.slice(0, 10),
      type: a.run_type,
      distance_km: Math.round((a.distance / 1000) * 10) / 10,
      pace_per_km: speedToPace(a.average_speed, 'km'),
    }))

    return {
      name,
      streak,
      goals,
      current_estimates,
      this_week_km: Math.round(this_week_km * 10) / 10,
      this_month_km: Math.round(this_month_km * 10) / 10,
      run_count_this_week,
      recent_runs,
    }
  })

  // 6. Active challenges
  const { data: challengeRows } = await supabaseAdmin
    .from('group_challenges')
    .select('name, challenge_type, target_meters, start_date, end_date')
    .eq('group_id', groupId)
    .lte('start_date', today)
    .gte('end_date', today)

  const active_challenges = (challengeRows ?? []).map(c => {
    // Only count activities that fall within the challenge's own date range
    const challengeStart = new Date(c.start_date + 'T00:00:00Z')
    const challengeEnd = new Date(c.end_date + 'T23:59:59Z')
    const challengeActivities = (activityRows ?? []).filter(a => {
      const d = new Date(a.start_date)
      return d >= challengeStart && d <= challengeEnd
    })
    const total_km = challengeActivities.reduce((s, a) => s + (a.distance ?? 0), 0) / 1000
    const target_km = c.target_meters ? c.target_meters / 1000 : null
    const pct = target_km ? Math.min(Math.round((total_km / target_km) * 100), 100) : 0
    return {
      name: c.name,
      type: c.challenge_type,
      start_date: c.start_date,
      end_date: c.end_date,
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

export interface AthleteContext {
  athlete_id: number
  name: string
  today: string
  goals: Array<{
    label: string
    distance_key: string
    target_secs: number
    current_secs: number | null
    days_to_race: number
  }>
  recent_runs: Array<{
    date: string
    type: string | null
    distance_km: number
    pace_per_km: string
  }>
  this_week_km: number
  this_month_km: number
  run_count_this_week: number
  streak: number
  avg_weekly_km_4w: number
}

export async function buildAthleteContext(athleteId: number): Promise<AthleteContext> {
  const today = new Date().toISOString().slice(0, 10)
  const cutoff35 = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: goalRows }, { data: activityRows }, { data: tokenRow }] = await Promise.all([
    supabaseAdmin
      .from('user_goals')
      .select('label, distance_key, target_secs, current_secs, race_date')
      .eq('athlete_id', athleteId)
      .order('race_date', { ascending: true }),
    supabaseAdmin
      .from('activities')
      .select('athlete_id, start_date, distance, moving_time, average_speed, run_type')
      .eq('athlete_id', athleteId)
      .gte('start_date', cutoff35)
      .order('start_date', { ascending: false })
      .limit(100),
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_name')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
  ])

  const todayDate = new Date(today + 'T00:00:00Z')
  const goals = (goalRows ?? []).map(g => {
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

  const now = new Date()
  const nowJakarta = toJakartaDate(now.toISOString())
  const weekStartJakarta = getWeekStart(nowJakarta)
  // Convert Jakarta week start back to UTC for comparison
  const weekStartUtc = new Date(weekStartJakarta.getTime() - 7 * 60 * 60 * 1000)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const runs = activityRows ?? []
  const weekRuns = runs.filter(a => new Date(a.start_date) >= weekStartUtc)
  const monthRuns = runs.filter(a => new Date(a.start_date) >= monthStart)

  const this_week_km = Math.round(weekRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 100) / 10
  const this_month_km = Math.round(monthRuns.reduce((s, a) => s + (a.distance ?? 0), 0) / 100) / 10
  const run_count_this_week = weekRuns.length

  // avg km/week over last 4 weeks = total last 28d / 4
  const cutoff28 = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
  const last28Runs = runs.filter(a => new Date(a.start_date) >= cutoff28)
  const avg_weekly_km_4w = Math.round(last28Runs.reduce((s, a) => s + (a.distance ?? 0), 0) / 4 / 1000 * 10) / 10

  const streak = computeStreak(runs, athleteId)

  const recent_runs = runs.slice(0, 10).map(a => ({
    date: a.start_date.slice(0, 10),
    type: a.run_type,
    distance_km: Math.round((a.distance / 1000) * 10) / 10,
    pace_per_km: speedToPace(a.average_speed, 'km'),
  }))

  return {
    athlete_id: athleteId,
    name: tokenRow?.athlete_name ?? `Athlete ${athleteId}`,
    today,
    goals,
    recent_runs,
    this_week_km,
    this_month_km,
    run_count_this_week,
    streak,
    avg_weekly_km_4w,
  }
}
