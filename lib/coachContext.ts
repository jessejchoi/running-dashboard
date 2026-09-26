import { buildAthleteMetrics, buildCoachFactsSnapshot, buildGroupMetrics, type CoachMetricTotal, type CoachSignal } from '@/lib/coachMetrics'
import type { EditionRun } from '@/lib/coachEdition'

export interface CoachContext {
  group: { name: string }
  today: string
  facts: ReturnType<typeof buildCoachFactsSnapshot>
  totals: Record<string, CoachMetricTotal>
  signals: CoachSignal[]
  members: Array<{
    athlete_id: number
    name: string
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
    ytd_km: number
    rolling_4w_km: number
    rolling_12w_km: number
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
    source_count: number
    progress_value: number
    target_value: number | null
    progress_unit: 'km' | 'meters_elevation' | 'runs' | 'member_weeks' | 'efforts'
    completed_member_weeks?: number
    elapsed_member_weeks?: number
  }>
  runs?: EditionRun[]
}

export async function buildCoachContext(groupId: string): Promise<CoachContext> {
  const metrics = await buildGroupMetrics(groupId)

  return {
    group: { name: metrics.group.name },
    today: metrics.today,
    facts: buildCoachFactsSnapshot(metrics),
    totals: metrics.totals,
    signals: metrics.signals,
    members: metrics.members.map(member => ({
      athlete_id: member.athlete_id,
      name: member.name,
      goals: member.goals.map(goal => ({
        label: goal.label,
        distance_key: goal.distance_key,
        target_secs: goal.target_secs,
        current_secs: goal.current_secs,
        days_to_race: goal.days_to_race,
      })),
      current_estimates: member.goals.map(goal => ({
        distance_key: goal.distance_key,
        current_secs: goal.current_secs,
      })),
      this_week_km: member.totals.week.km,
      this_month_km: member.totals.month.km,
      ytd_km: member.totals.ytd.km,
      rolling_4w_km: member.totals.rolling_4w.km,
      rolling_12w_km: member.totals.rolling_12w.km,
      run_count_this_week: member.totals.week.source_count,
      recent_runs: member.recent_runs,
    })),
    active_challenges: metrics.active_challenges,
    runs: (metrics.runs ?? []).map(run => ({
      athlete_id: run.athlete_id,
      start_date: run.start_date,
      distance: run.distance,
      moving_time: run.moving_time ?? null,
      run_type: run.run_type ?? null,
    })),
  }
}

export interface AthleteContext {
  athlete_id: number
  name: string
  today: string
  facts: ReturnType<typeof buildCoachFactsSnapshot>
  totals: Record<string, CoachMetricTotal>
  signals: CoachSignal[]
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
  ytd_km: number
  rolling_4w_km: number
  rolling_12w_km: number
  run_count_this_week: number
  avg_weekly_km_4w: number
}

export async function buildAthleteContext(athleteId: number): Promise<AthleteContext> {
  const metrics = await buildAthleteMetrics(athleteId)

  return {
    athlete_id: athleteId,
    name: metrics.name,
    today: new Date().toISOString().slice(0, 10),
    facts: buildCoachFactsSnapshot(metrics),
    totals: metrics.totals,
    signals: metrics.signals,
    goals: metrics.goals.map(goal => ({
      label: goal.label,
      distance_key: goal.distance_key,
      target_secs: goal.target_secs,
      current_secs: goal.current_secs,
      days_to_race: goal.days_to_race,
    })),
    recent_runs: metrics.recent_runs,
    this_week_km: metrics.totals.week.km,
    this_month_km: metrics.totals.month.km,
    ytd_km: metrics.totals.ytd.km,
    rolling_4w_km: metrics.totals.rolling_4w.km,
    rolling_12w_km: metrics.totals.rolling_12w.km,
    run_count_this_week: metrics.totals.week.source_count,
    avg_weekly_km_4w: Math.round((metrics.totals.rolling_4w.km / 4) * 10) / 10,
  }
}
