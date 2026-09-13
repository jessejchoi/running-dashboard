import { randomUUID } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import {
  type PlanSession,
  validateConfig,
  configMeters,
  validatePreferences,
  generateWeek,
  unambiguousMatches,
  progression,
} from '@/lib/planning'
import { localDate, addDays, validDate } from '@/lib/calendar'
import { loadEstimates, estimateValues } from '@/lib/estimates'
export async function loadPlan(athleteId: number) {
  const [
    { data: sessions, error },
    { data: state },
    { data: prefs },
    { data: revisions },
    { data: runs },
    { data: goals },
  ] = await Promise.all([
    supabaseAdmin
      .from('user_plans')
      .select('*')
      .eq('athlete_id', athleteId)
      .gte('plan_date', addDays(localDate(), -28))
      .lte('plan_date', addDays(localDate(), 180))
      .order('plan_date')
      .order('session_index'),
    supabaseAdmin
      .from('athlete_state')
      .select('data_version,plan_version')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    supabaseAdmin
      .from('training_preferences')
      .select('config')
      .eq('athlete_id', athleteId)
      .maybeSingle(),
    supabaseAdmin
      .from('plan_revisions')
      .select('id,version,reason,created_at')
      .eq('athlete_id', athleteId)
      .order('version', { ascending: false })
      .limit(10),
    supabaseAdmin
      .from('activities')
      .select('id,start_date,name,distance,moving_time,run_type')
      .eq('athlete_id', athleteId)
      .gte('start_date', new Date(Date.now() - 28 * 86400000).toISOString())
      .order('start_date', { ascending: false })
      .limit(300),
    supabaseAdmin.from('user_goals').select('*').eq('athlete_id', athleteId),
  ])
  if (error) throw error
  return {
    sessions: (sessions ?? []) as PlanSession[],
    version: Number(state?.plan_version ?? 0),
    dataVersion: Number(state?.data_version ?? 0),
    preferences: prefs?.config ?? null,
    revisions: revisions ?? [],
    runs: runs ?? [],
    goals: goals ?? [],
    progression: prefs?.config
      ? progression(goals ?? [], validatePreferences(prefs.config))
      : [],
    autoAdaptEnabled: process.env.AUTO_ADAPT_ENABLED === 'true',
  }
}
export async function commitPlan(
  athleteId: number,
  version: number,
  rows: PlanSession[],
  deletes: string[],
  reason: string,
  dataVersion: number | null = null,
  auto = false,
  today = localDate(),
) {
  const { data, error } = await supabaseAdmin.rpc('commit_plan', {
    p_athlete: athleteId,
    p_version: version,
    p_data_version: dataVersion,
    p_rows: rows,
    p_delete: deletes,
    p_reason: reason,
    p_auto: auto,
    p_today: today,
  })
  if (error) throw new Error(error.message)
  return Number(data)
}
export async function saveManualSession(athleteId: number, body: any) {
  if (!Number.isInteger(body.version) || !validDate(body.date))
    throw new Error('A current version and valid date are required')
  const plan = await loadPlan(athleteId)
  const existing = body.id ? plan.sessions.find((s) => s.id === body.id) : null
  if (body.id && !existing) throw new Error('Session not found')
  const config = validateConfig(body.config)
  const session: PlanSession = {
    ...(existing ?? {}),
    id: existing?.id ?? randomUUID(),
    plan_date: body.date,
    session_index: existing?.session_index ?? 0,
    session_type: config.sessionType,
    description: config.name,
    target_distance_meters: configMeters(config) || null,
    config,
    source: 'manual',
    locked: true,
    status: existing?.status ?? 'planned',
    activity_id: existing?.activity_id ?? null,
  }
  return commitPlan(
    athleteId,
    body.version,
    [session],
    [],
    'Manual workout edit',
  )
}
export async function adaptPlan(athleteId: number, requested = false) {
  const plan = await loadPlan(athleteId)
  if (!plan.preferences) {
    if (requested) throw new Error('Set training preferences first')
    return
  }
  const p = validatePreferences(plan.preferences)
  if (!requested && (process.env.AUTO_ADAPT_ENABLED !== 'true' || !p.autoAdapt))
    return
  const { data: goals, error } = await supabaseAdmin
    .from('user_goals')
    .select('*')
    .eq('athlete_id', athleteId)
  if (error) throw error
  const matched = unambiguousMatches(plan.sessions, plan.runs, p.timezone)
  if (matched.length) {
    await commitPlan(
      athleteId,
      plan.version,
      matched,
      [],
      'Matched unambiguous recorded runs',
      plan.dataVersion,
    )
    return adaptPlan(athleteId, requested)
  }
  const estimates = estimateValues(await loadEstimates(athleteId))
  const { data: weeklyGoals, error: weeklyError } = await supabaseAdmin
    .from('training_goals')
    .select('metric,target,active')
    .eq('athlete_id', athleteId)
  if (weeklyError) throw weeklyError
  const next = generateWeek({
    trainingGoals: weeklyGoals ?? [],
    preferences: p,
    sessions: plan.sessions,
    runs: plan.runs,
    goals: goals ?? [],
    estimates,
    now: new Date(),
    id: randomUUID,
  })
  // No-op input refreshes don't create identical revisions.
  if (
    !next.deleteIds.length &&
    next.rows.every((row) => {
      const old = plan.sessions.find((s) => s.id === row.id)
      return (
        old &&
        JSON.stringify(old.config) === JSON.stringify(row.config) &&
        old.description === row.description
      )
    })
  )
    return
  await commitPlan(
    athleteId,
    plan.version,
    next.rows,
    next.deleteIds,
    next.reason,
    plan.dataVersion,
    true,
    next.today,
  )
}
