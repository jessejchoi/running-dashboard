import { supabaseAdmin } from '@/lib/supabase'
import { fetchActivities, getValidToken } from '@/lib/strava'
import { enqueueJob, claimJob, finishJob } from '@/lib/jobs'
import { importMayRun } from '@/lib/stravaBudget'
export function summaryRow(a: any, athleteId: number) {
  return {
    id: a.id,
    athlete_id: athleteId,
    name: a.name,
    type: 'Run',
    start_date: a.start_date,
    distance: a.distance,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    total_elevation_gain: a.total_elevation_gain,
    average_speed: a.average_speed,
    max_speed: a.max_speed,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    average_cadence: a.average_cadence ?? null,
    suffer_score: a.suffer_score ?? null,
    run_type: a.workout_type === 1 ? 'race' : 'easy',
    is_race: a.workout_type === 1,
    run_type_manual: false,
    detail_synced: false,
    raw: a,
  }
}
export async function startHistory(athleteId: number) {
  const { error } = await supabaseAdmin
    .from('history_imports')
    .upsert(
      { athlete_id: athleteId, before_epoch: Math.ceil(Date.now() / 1000) },
      { onConflict: 'athlete_id', ignoreDuplicates: true },
    )
  if (error) throw error
  return queueHistory(athleteId)
}
export async function queueHistory(athleteId: number) {
  const { data, error } = await supabaseAdmin
    .from('history_imports')
    .select('*')
    .eq('athlete_id', athleteId)
    .single()
  if (error) throw error
  if (data.status === 'complete' || data.status === 'reconnect_required') return
  return enqueueJob(
    'history',
    String(athleteId),
    `${data.before_epoch}:${data.page}`,
  )
}
export async function runHistoryJob(id: string) {
  const job = await claimJob(id)
  if (!job) return
  const athleteId = Number(job.scope)
  try {
    const pause = await importMayRun()
    if (pause) {
      await supabaseAdmin
        .from('history_imports')
        .update({ next_attempt_at: pause, error: 'Waiting for Strava quota' })
        .eq('athlete_id', athleteId)
      await finishJob(job, 'Waiting for Strava quota', pause)
      return
    }
    const { data: state, error } = await supabaseAdmin
      .from('history_imports')
      .select('*')
      .eq('athlete_id', athleteId)
      .single()
    if (error) throw error
    if (
      `${state.before_epoch}:${state.page}` !== job.input_version ||
      state.status === 'complete'
    ) {
      await finishJob(job)
      return
    }
    const token = await getValidToken(athleteId)
    if (!token) throw new Error('Strava 401 reconnect required')
    const activities = await fetchActivities(
      token,
      state.page,
      100,
      state.before_epoch,
    )
    const rows = activities
      .filter((a: any) => a.type === 'Run' || a.sport_type === 'Run')
      .map((a: any) => summaryRow(a, athleteId))
    if (rows.length) {
      const { error } = await supabaseAdmin
        .from('activities')
        .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw error
    }
    // Compare-and-swap: a retry can insert duplicates harmlessly, but advances only once.
    const { data: advanced, error: advanceError } = await supabaseAdmin
      .from('history_imports')
      .update({
        page: state.page + 1,
        imported: state.imported + rows.length,
        status: activities.length < 100 ? 'complete' : 'queued',
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('athlete_id', athleteId)
      .eq('page', state.page)
      .select('page')
    if (advanceError) throw advanceError
    await finishJob(job)
    if (advanced?.length && activities.length === 100)
      await queueHistory(athleteId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const revoked = message.includes('401')
    const retry = new Date(
      Date.now() +
        (message.includes('429')
          ? 900000
          : Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6))),
    ).toISOString()
    await supabaseAdmin
      .from('history_imports')
      .update({
        error: message,
        status: revoked ? 'reconnect_required' : 'queued',
        next_attempt_at: retry,
      })
      .eq('athlete_id', athleteId)
      .eq('before_epoch', Number(job.input_version.split(':')[0]))
      .eq('page', Number(job.input_version.split(':')[1]))
    await finishJob(job, revoked ? undefined : message, retry)
  }
}
