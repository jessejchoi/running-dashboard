import { recentCoachRuns, canonicalTotals } from '@/lib/coachData'
import { getGroupLatestEstimates } from '@/lib/latestEstimates'
import { supabaseAdmin } from '@/lib/supabase'
import { speedToPace } from '@/lib/utils'
import { addDays, commonTimezone, localDate, runDay, weekStart, DEFAULT_TIMEZONE } from '@/lib/calendar'
import { athleteTimezone, athleteTimezones } from '@/lib/timezone'
import { loadRhythmSummaries, type RhythmSummaries } from '@/lib/rhythmData'

const DAY_MS = 24 * 60 * 60 * 1000

export type CoachRangeKey = 'week' | 'month' | 'rolling_4w' | 'rolling_12w' | 'ytd' | 'all_time'

export interface CoachRangeDefinition {
  key: CoachRangeKey
  label: string
  range_start: string | null
  range_end: string
}

export interface CoachMetricTotal extends CoachRangeDefinition {
  unit: 'km'
  meters: number
  km: number
  source_count: number
}

export interface CoachActivity {
  id?: number
  effort_count?: number
  source_count?: number
  athlete_id: number
  start_date: string
  /** Local wall-clock start (or local date, for daily aggregates). */
  start_date_local?: string | null
  distance: number | null
  moving_time?: number | null
  average_speed?: number | null
  average_heartrate?: number | null
  run_type?: string | null
  type?: string | null
  total_elevation_gain?: number | null
}

export interface CoachGoal {
  label: string
  distance_key: string
  target_secs: number
  current_secs: number | null
  race_date: string
}

export interface CoachDebrief {
  run_id: number
  perceived_effort: string | null
  athlete_note: string | null
  generated_at: string
}

export interface CoachSignal {
  key: string
  label: string
  severity: 'info' | 'positive' | 'warning'
  confidence: number
  evidence: string
  athlete_id?: number
}

export interface CoachAthleteMetrics {
  athlete_id: number
  name: string
  totals: Record<CoachRangeKey, CoachMetricTotal>
  run_type_mix_4w: Record<string, number>
  recent_runs: Array<{
    date: string
    type: string | null
    distance_km: number
    pace_per_km: string
  }>
  /** Rhythm streak: consecutive weeks hitting their weekly runs target. 0 while Rhythm is off. */
  streak: number
  /** Weeks since Rhythm launched (1 = launch week), or null while Rhythm is off. */
  rhythm_season_week: number | null
  goals: Array<{
    label: string
    distance_key: string
    target_secs: number
    current_secs: number | null
    days_to_race: number
    gap_secs: number | null
  }>
  recent_debriefs: CoachDebrief[]
  signals: CoachSignal[]
}

export interface CoachChallengeMetrics {
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
}

export interface CoachGroupMetrics {
  generated_at: string
  today: string
  group: { id: string; name: string }
  totals: Record<CoachRangeKey, CoachMetricTotal>
  members: CoachAthleteMetrics[]
  active_challenges: CoachChallengeMetrics[]
  signals: CoachSignal[]
  /** Raw runs from the last 12 weeks, for the weekly Coach edition. */
  runs?: CoachActivity[]
}

/**
 * Totals ranges as local calendar dates, [range_start, range_end), in the
 * viewer's zone. Runs match on the local date they were run.
 */
export function getCoachRangeDefinitions(
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): Record<CoachRangeKey, CoachRangeDefinition> {
  const today = localDate(now, timezone)
  const rangeEnd = addDays(today, 1)
  const range = (key: CoachRangeKey, label: string, range_start: string | null) => ({ key, label, range_start, range_end: rangeEnd })
  return {
    week: range('week', 'This week', weekStart(today)),
    month: range('month', 'This month', today.slice(0, 7) + '-01'),
    rolling_4w: range('rolling_4w', 'Rolling 4 weeks', addDays(rangeEnd, -28)),
    rolling_12w: range('rolling_12w', 'Rolling 12 weeks', addDays(rangeEnd, -84)),
    ytd: range('ytd', 'YTD', today.slice(0, 4) + '-01-01'),
    all_time: range('all_time', 'All time', null),
  }
}

function isRun(activity: CoachActivity) {
  return activity.type === 'Run'
}

function inRange(activity: CoachActivity, range: CoachRangeDefinition, timezone = DEFAULT_TIMEZONE) {
  const day = runDay(activity, timezone)
  if (range.range_start && day < range.range_start) return false
  return day < range.range_end
}

function totalForRange(activities: CoachActivity[], range: CoachRangeDefinition, timezone: string): CoachMetricTotal {
  const runs = activities.filter(a => isRun(a) && inRange(a, range, timezone))
  const meters = runs.reduce((sum, a) => sum + (a.distance ?? 0), 0)
  return {
    ...range,
    unit: 'km',
    meters: Math.round(meters),
    km: Math.round((meters / 1000) * 10) / 10,
    source_count: runs.reduce((n,a)=>n+(a.source_count??1),0),
  }
}

export function buildCoachTotals(
  activities: CoachActivity[],
  now = new Date(),
  timezone = DEFAULT_TIMEZONE,
): Record<CoachRangeKey, CoachMetricTotal> {
  const ranges = getCoachRangeDefinitions(now, timezone)
  return {
    week: totalForRange(activities, ranges.week, timezone),
    month: totalForRange(activities, ranges.month, timezone),
    rolling_4w: totalForRange(activities, ranges.rolling_4w, timezone),
    rolling_12w: totalForRange(activities, ranges.rolling_12w, timezone),
    ytd: totalForRange(activities, ranges.ytd, timezone),
    all_time: totalForRange(activities, ranges.all_time, timezone),
  }
}

function daysToRace(raceDate: string, today: string) {
  return Math.round((Date.parse(raceDate.slice(0, 10)) - Date.parse(today)) / DAY_MS)
}

function runTypeMix(activities: CoachActivity[], range: CoachMetricTotal, timezone: string) {
  const mix: Record<string, number> = {}
  for (const activity of activities) {
    if (!isRun(activity) || !inRange(activity, range, timezone)) continue
    const type = activity.run_type ?? 'untyped'
    mix[type] = (mix[type] ?? 0) + 1
  }
  return mix
}

function recentRuns(activities: CoachActivity[], timezone: string) {
  return activities
    .filter(isRun)
    .sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime())
    .slice(0, 10)
    .map(a => ({
      date: runDay(a, timezone),
      type: a.run_type ?? null,
      distance_km: Math.round(((a.distance ?? 0) / 1000) * 10) / 10,
      pace_per_km: speedToPace(a.average_speed ?? 0, 'km'),
    }))
}

export function buildAthleteSignals(metrics: {
  athlete_id: number
  name: string
  totals: Record<CoachRangeKey, CoachMetricTotal>
  run_type_mix_4w: Record<string, number>
  goals: CoachAthleteMetrics['goals']
}): CoachSignal[] {
  const signals: CoachSignal[] = []
  const week = metrics.totals.week.km
  const fourWeekAvg = metrics.totals.rolling_4w.km / 4
  const twelveWeekAvg = metrics.totals.rolling_12w.km / 12

  if (fourWeekAvg > 0) {
    const change = (week - fourWeekAvg) / fourWeekAvg
    if (change > 0.25) {
      signals.push({
        key: 'volume_spike',
        label: 'Volume spike',
        severity: 'warning',
        confidence: 0.8,
        athlete_id: metrics.athlete_id,
        evidence: `${metrics.name} is at ${week.toFixed(1)}km this week vs ${fourWeekAvg.toFixed(1)}km/week over the last 4 weeks.`,
      })
    } else if (change < -0.35) {
      signals.push({
        key: 'volume_dip',
        label: 'Volume dip',
        severity: 'info',
        confidence: 0.75,
        athlete_id: metrics.athlete_id,
        evidence: `${metrics.name} is at ${week.toFixed(1)}km this week vs ${fourWeekAvg.toFixed(1)}km/week over the last 4 weeks.`,
      })
    }
  }

  const qualityRuns = Object.entries(metrics.run_type_mix_4w)
    .filter(([key]) => ['intervals', 'interval_5k', 'interval_10k', 'threshold', 'tempo'].includes(key))
    .reduce((sum, [, count]) => sum + count, 0)
  const totalRuns4w = Object.values(metrics.run_type_mix_4w).reduce((sum, count) => sum + count, 0)
  if (totalRuns4w >= 4 && qualityRuns / totalRuns4w > 0.45) {
    signals.push({
      key: 'intensity_heavy',
      label: 'Intensity-heavy block',
      severity: 'warning',
      confidence: 0.7,
      athlete_id: metrics.athlete_id,
      evidence: `${qualityRuns} of ${totalRuns4w} runs in the last 4 weeks were quality sessions.`,
    })
  }

  const nextGoal = metrics.goals
    .filter(g => g.days_to_race >= 0)
    .sort((a, b) => a.days_to_race - b.days_to_race)[0]
  if (nextGoal?.gap_secs != null) {
    signals.push({
      key: nextGoal.gap_secs <= 0 ? 'goal_ready' : 'goal_gap',
      label: nextGoal.gap_secs <= 0 ? 'Goal pace is in range' : 'Goal gap remains',
      severity: nextGoal.gap_secs <= 0 ? 'positive' : 'info',
      confidence: 0.75,
      athlete_id: metrics.athlete_id,
      evidence: `${metrics.name}'s current ${nextGoal.distance_key} estimate is ${Math.abs(nextGoal.gap_secs)}s ${nextGoal.gap_secs <= 0 ? 'ahead of' : 'behind'} target with ${nextGoal.days_to_race} days to race.`,
    })
  }

  if (twelveWeekAvg > 0 && fourWeekAvg > twelveWeekAvg * 1.15) {
    signals.push({
      key: 'momentum_rising',
      label: 'Volume momentum rising',
      severity: 'positive',
      confidence: 0.72,
      athlete_id: metrics.athlete_id,
      evidence: `${metrics.name} averaged ${fourWeekAvg.toFixed(1)}km/week over 4 weeks vs ${twelveWeekAvg.toFixed(1)}km/week over 12 weeks.`,
    })
  }

  return signals
}

export function buildAthleteMetricsFromActivities(params: {
  athlete_id: number
  name: string
  activities: CoachActivity[]
  goals: CoachGoal[]
  debriefs?: CoachDebrief[]
  now?: Date
  /** The athlete's current zone. */
  timezone?: string
  /** From loadRhythmSummaries; omitted while Rhythm is off. */
  rhythm?: { streak: number; seasonWeek: number } | null
}): CoachAthleteMetrics {
  const now = params.now ?? new Date()
  const timezone = params.timezone ?? DEFAULT_TIMEZONE
  const today = localDate(now, timezone)
  const totals = buildCoachTotals(params.activities, now, timezone)
  const goals = params.goals.map(g => ({
    label: g.label,
    distance_key: g.distance_key,
    target_secs: g.target_secs,
    current_secs: g.current_secs,
    days_to_race: daysToRace(g.race_date, today),
    gap_secs: g.current_secs == null ? null : g.current_secs - g.target_secs,
  }))
  const metricsWithoutSignals = {
    athlete_id: params.athlete_id,
    name: params.name,
    totals,
    run_type_mix_4w: runTypeMix(params.activities, totals.rolling_4w, timezone),
    recent_runs: recentRuns(params.activities, timezone),
    streak: params.rhythm?.streak ?? 0,
    rhythm_season_week: params.rhythm?.seasonWeek ?? null,
    goals,
    recent_debriefs: params.debriefs ?? [],
    signals: [],
  }
  return {
    ...metricsWithoutSignals,
    signals: buildAthleteSignals(metricsWithoutSignals),
  }
}

export function buildGroupSignals(group: Pick<CoachGroupMetrics, 'totals' | 'members'>): CoachSignal[] {
  const signals: CoachSignal[] = []
  const week = group.totals.week.km
  const fourWeekAvg = group.totals.rolling_4w.km / 4
  if (fourWeekAvg > 0) {
    const change = (week - fourWeekAvg) / fourWeekAvg
    signals.push({
      key: change > 0.15 ? 'group_momentum_rising' : change < -0.25 ? 'group_momentum_dipping' : 'group_momentum_steady',
      label: change > 0.15 ? 'Group momentum rising' : change < -0.25 ? 'Group momentum dipping' : 'Group momentum steady',
      severity: change > 0.15 ? 'positive' : change < -0.25 ? 'warning' : 'info',
      confidence: 0.78,
      evidence: `Group is at ${week.toFixed(1)}km this week vs ${fourWeekAvg.toFixed(1)}km/week over the last 4 weeks.`,
    })
  }

  const inactive = group.members.filter(m => m.totals.week.source_count === 0)
  if (inactive.length > 0) {
    signals.push({
      key: 'inactive_members',
      label: 'Members need a nudge',
      severity: 'info',
      confidence: 0.85,
      evidence: `${inactive.map(m => m.name.split(' ')[0]).join(', ')} have not logged a run this week.`,
    })
  }

  return signals
}

export function buildChallengeMetricsFromActivities(params: {
  challenges: Array<{
    name: string
    challenge_type: string
    target_meters: number | null
    start_date: string
    end_date: string
    config?: Record<string, unknown> | null
  }>
  activities: CoachActivity[]
  memberIds?: number[]
  now?: Date
  timezone?: string
}): CoachChallengeMetrics[] {
  const now = params.now ?? new Date()
  const timezone = params.timezone ?? DEFAULT_TIMEZONE
  const today = localDate(now, timezone)
  const memberIds = params.memberIds ?? Array.from(new Set(params.activities.map(a => a.athlete_id)))

  return params.challenges.map(challenge => {
    // Inclusive local dates; each run counts on the day it was run.
    const relevant = params.activities.filter(a => {
      if (!isRun(a)) return false
      const day = runDay(a, timezone)
      return day >= challenge.start_date && day <= challenge.end_date
    })
    const cType = challenge.challenge_type ?? 'group_distance'
    const meters = relevant.reduce((sum, a) => sum + (a.distance ?? 0), 0)
    const targetKm = challenge.target_meters ? challenge.target_meters / 1000 : null
    const distancePct = targetKm ? Math.min(Math.round((meters / 1000 / targetKm) * 100), 100) : 0
    const base = {
      name: challenge.name,
      type: cType,
      start_date: challenge.start_date,
      end_date: challenge.end_date,
      total_km: Math.round((meters / 1000) * 10) / 10,
      target_km: targetKm,
      source_count: relevant.reduce((n,a)=>n+(a.source_count??1),0),
    }

    if (cType === 'elevation') {
      const elevation = relevant.reduce((sum, a) => sum + (a.total_elevation_gain ?? 0), 0)
      const target = challenge.target_meters ?? null
      return {
        ...base,
        pct: target ? Math.min(Math.round((elevation / target) * 100), 100) : 0,
        progress_value: Math.round(elevation),
        target_value: target,
        progress_unit: 'meters_elevation',
      }
    }

    if (cType === 'run_count') {
      const target = challenge.target_meters ?? null
      return {
        ...base,
        pct: target ? Math.min(Math.round((relevant.reduce((n,a)=>n+(a.source_count??1),0) / target) * 100), 100) : 0,
        progress_value: relevant.reduce((n,a)=>n+(a.source_count??1),0),
        target_value: target,
        progress_unit: 'runs',
      }
    }

    if (cType === 'weekly_quota') {
      const weeklyMeters = Number(challenge.config?.weekly_meters ?? challenge.target_meters ?? 0)
      const weeks: string[] = []
      for (let week = weekStart(challenge.start_date); week <= challenge.end_date; week = addDays(week, 7)) weeks.push(week)

      let elapsedMemberWeeks = 0
      let completedMemberWeeks = 0
      for (const athleteId of memberIds) {
        const memberRuns = relevant.filter(a => a.athlete_id === athleteId)
        for (const week of weeks) {
          if (week > today) continue
          elapsedMemberWeeks++
          const weekEnd = addDays(week, 7)
          const weekMeters = memberRuns
            .filter(a => {
              const day = runDay(a, timezone)
              return day >= week && day < weekEnd
            })
            .reduce((sum, a) => sum + (a.distance ?? 0), 0)
          if (weeklyMeters > 0 && weekMeters >= weeklyMeters) completedMemberWeeks++
        }
      }

      return {
        ...base,
        pct: elapsedMemberWeeks > 0 ? Math.min(Math.round((completedMemberWeeks / elapsedMemberWeeks) * 100), 100) : 0,
        progress_value: completedMemberWeeks,
        target_value: elapsedMemberWeeks,
        progress_unit: 'member_weeks',
        completed_member_weeks: completedMemberWeeks,
        elapsed_member_weeks: elapsedMemberWeeks,
      }
    }

    if (cType === 'fastest_effort') {
      const effortCount=relevant.reduce((n,a)=>n+(a.effort_count??0),0)
      return {
        ...base,
        pct: effortCount > 0 ? 100 : 0,
        progress_value: effortCount,
        target_value: null,
        progress_unit: 'efforts',
      }
    }

    return {
      ...base,
      pct: distancePct,
      progress_value: Math.round((meters / 1000) * 10) / 10,
      target_value: targetKm,
      progress_unit: 'km',
    }
  })
}

export function buildCoachFactsSnapshot(metrics: CoachGroupMetrics | CoachAthleteMetrics) {
  if ('members' in metrics) {
    return {
      generated_at: metrics.generated_at,
      today: metrics.today,
      group: metrics.group,
      group_totals: metrics.totals,
      member_totals: metrics.members.map(m => ({
        athlete_id: m.athlete_id,
        name: m.name,
        totals: m.totals,
      })),
      active_challenges: metrics.active_challenges,
      signals: metrics.signals,
    }
  }

  return {
    athlete_id: metrics.athlete_id,
    name: metrics.name,
    totals: metrics.totals,
    goals: metrics.goals,
    run_type_mix_4w: metrics.run_type_mix_4w,
    recent_debriefs: metrics.recent_debriefs,
    signals: metrics.signals,
  }
}

// Coaching copy shouldn't fail because Rhythm couldn't load; the streak just reads as untracked.
function coachRhythm(ids: number[]): Promise<RhythmSummaries | null> {
  return loadRhythmSummaries(ids).catch(error => {
    console.error('[coach] Rhythm unavailable', error)
    return null
  })
}

function rhythmFor(summaries: RhythmSummaries | null, athleteId: number) {
  const result = summaries?.byAthlete[athleteId]
  return result ? { streak: result.streak, seasonWeek: result.seasonWeek } : null
}

export async function buildAthleteMetrics(athleteId: number): Promise<CoachAthleteMetrics> {
  const now = new Date()
  const timezone = await athleteTimezone(athleteId)
  const [{ data: allRuns }, { data: tokenRow }, { data: goals }, { data: debriefs }, rhythm] = await Promise.all([
    recentCoachRuns([athleteId]),
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_name')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    supabaseAdmin
      .from('user_goals')
      .select('label, distance_key, target_secs, current_secs, race_date').eq('status','active')
      .eq('athlete_id', athleteId)
      .order('race_date', { ascending: true }),
    supabaseAdmin
      .from('run_coach_notes')
      .select('run_id, perceived_effort, athlete_note, generated_at')
      .eq('athlete_id', athleteId)
      .order('generated_at', { ascending: false })
      .limit(5),
    coachRhythm([athleteId]),
  ])

  const activities = allRuns ?? []
  const [totals, estimates] = await Promise.all([canonicalTotals([athleteId], getCoachRangeDefinitions(now, timezone)), getGroupLatestEstimates([athleteId])])
  const metrics = buildAthleteMetricsFromActivities({
    athlete_id: athleteId,
    name: tokenRow?.athlete_name ?? `Athlete ${athleteId}`,
    activities,
    goals: (goals ?? []).map(g=>({...g,current_secs:estimates[athleteId]?.[g.distance_key]??null})),
    debriefs: debriefs ?? [],
    now,
    timezone,
    rhythm: rhythmFor(rhythm, athleteId),
  })
  metrics.totals = totals[athleteId] ?? metrics.totals
  metrics.signals = buildAthleteSignals(metrics)
  return metrics
}

export async function buildGroupMetrics(groupId: string): Promise<CoachGroupMetrics> {
  const now = new Date()
  const { data: group } = await supabaseAdmin
    .from('groups')
    .select('name')
    .eq('id', groupId)
    .single()

  const { data: memberRows } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', groupId)

  const memberIds = (memberRows ?? []).map(m => m.athlete_id)
  // One shared "today" for the group: the zone most members run in.
  const timezone = commonTimezone(Object.values(await athleteTimezones(memberIds)))
  const today = localDate(now, timezone)
  if (memberIds.length === 0) {
    const totals = buildCoachTotals([], now, timezone)
    return {
      generated_at: now.toISOString(),
      today,
      group: { id: groupId, name: group?.name ?? 'Group' },
      totals,
      members: [],
      active_challenges: [],
      signals: [],
    }
  }

  const [{ data: tokens }, { data: goals }, { data: activities }, { data: debriefs }, { data: challenges }, rhythm] = await Promise.all([
    supabaseAdmin
      .from('strava_tokens')
      .select('athlete_id, athlete_name')
      .in('athlete_id', memberIds),
    supabaseAdmin
      .from('user_goals')
      .select('athlete_id, label, distance_key, target_secs, current_secs, race_date').eq('status','active')
      .in('athlete_id', memberIds),
    recentCoachRuns(memberIds),
    supabaseAdmin
      .from('run_coach_notes')
      .select('run_id, athlete_id, perceived_effort, athlete_note, generated_at')
      .in('athlete_id', memberIds)
      .order('generated_at', { ascending: false })
      .limit(25),
    supabaseAdmin
      .from('group_challenges')
      .select('name, challenge_type, target_meters, start_date, end_date, config')
      .eq('group_id', groupId)
      .lte('start_date', today)
      .gte('end_date', today),
    coachRhythm(memberIds),
  ])

  const nameMap: Record<number, string> = {}
  for (const token of tokens ?? []) {
    nameMap[token.athlete_id] = token.athlete_name ?? `Athlete ${token.athlete_id}`
  }

  const [canonical, estimates] = await Promise.all([canonicalTotals(memberIds, getCoachRangeDefinitions(now, timezone)), getGroupLatestEstimates(memberIds)])
  const allActivities = activities ?? []
  const members = memberIds.map(athleteId => buildAthleteMetricsFromActivities({
    athlete_id: athleteId,
    name: nameMap[athleteId] ?? `Athlete ${athleteId}`,
    activities: allActivities.filter(a => a.athlete_id === athleteId),
    goals: (goals ?? []).filter(g => g.athlete_id === athleteId).map(g=>({...g,current_secs:estimates[athleteId]?.[g.distance_key]??null})),
    debriefs: (debriefs ?? []).filter(d => d.athlete_id === athleteId),
    now,
    timezone,
    rhythm: rhythmFor(rhythm, athleteId),
  }))
  for (const member of members) { member.totals = canonical[member.athlete_id] ?? member.totals; member.signals = buildAthleteSignals(member) }
  const totals = buildCoachTotals([], now, timezone)
  for (const key of Object.keys(totals) as CoachRangeKey[]) {
    totals[key].meters = members.reduce((n,m)=>n+m.totals[key].meters,0)
    totals[key].km = Math.round(totals[key].meters/100)/10
    totals[key].source_count = members.reduce((n,m)=>n+m.totals[key].source_count,0)
  }
  let challengeActivities: CoachActivity[] = []
  if (challenges?.length) {
    // A day early covers zones ahead of UTC; runs are matched on local dates below.
    const from = addDays(challenges.map(c=>c.start_date).sort()[0], -1) + 'T00:00:00Z'
    const {data,error} = await supabaseAdmin.rpc('group_daily_context',{p_athletes:memberIds,p_from:from,p_to:now.toISOString()})
    if(error) throw error
    challengeActivities = data ?? []
  }
  const groupWithoutSignals = {
    generated_at: now.toISOString(),
    today,
    group: { id: groupId, name: group?.name ?? 'Group' },
    totals,
    members,
    active_challenges: buildChallengeMetricsFromActivities({ challenges: challenges ?? [], activities: challengeActivities, memberIds, now, timezone }),
    signals: [],
  }

  return {
    ...groupWithoutSignals,
    signals: buildGroupSignals(groupWithoutSignals),
    runs: allActivities,
  }
}

export async function persistCoachAuditEvent(params: {
  scope: 'athlete' | 'group' | 'run'
  route: string
  athlete_id?: number | null
  group_id?: string | null
  run_id?: number | null
  facts: unknown
  signals?: unknown
}) {
  try {
    await supabaseAdmin
      .from('coach_audit_events')
      .insert({
        scope: params.scope,
        route: params.route,
        athlete_id: params.athlete_id ?? null,
        group_id: params.group_id ?? null,
        run_id: params.run_id ?? null,
        facts_json: params.facts,
        signals_json: params.signals ?? null,
        generated_at: new Date().toISOString(),
      })
  } catch (err) {
    console.error('[coach/audit]', err instanceof Error ? err.message : String(err))
  }
}
