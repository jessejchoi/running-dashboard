import { supabaseAdmin } from '@/lib/supabase'
import type { PerformanceCorpus } from './cpCorpus'
import { athleteCalibration } from './raceCalibration'
import { marathonEnduranceEnabled } from './personalization'
import { subMonths } from 'date-fns'

/** A single paginated corpus serves all pre-race replays. No per-race network
 * requests or archive enrichment. Cached with the versioned estimate bundle. */
export async function loadCalibrationCorpus(athleteId: number, asOf = new Date()): Promise<PerformanceCorpus> {
  const cutoff = subMonths(asOf, 12).toISOString()
  async function read(table: string, columns: string, date: string, order: string[]) {
    const rows: any[] = []
    for (let offset = 0; ; offset += 500) {
      let q = supabaseAdmin.from(table).select(columns).eq('athlete_id', athleteId).gte(date, cutoff).lt(date, asOf.toISOString())
      if (table === 'activities') q = q.eq('type', 'Run')
      for (const key of order) q = q.order(key)
      const { data, error } = await q.range(offset, offset + 499)
      if (error) throw new Error(`Calibration evidence read failed: ${error.code}`)
      rows.push(...(data ?? []))
      if (!data || data.length < 500) return rows
    }
  }
  const [runs, efforts, profile] = await Promise.all([
    read('activities', 'id,start_date,distance,moving_time,elapsed_time,official_result_secs,is_race,run_type,excluded_from_analysis,average_speed,average_heartrate,suffer_score,total_elevation_gain,splits,laps,trainer:raw->trainer,sport_type:raw->sport_type,perceived_exertion:raw->perceived_exertion', 'start_date', ['start_date','id']),
    read('activity_best_efforts', 'activity_id,activity_start_date,duration_secs,best_pace_sec_per_km,avg_hr', 'activity_start_date', ['activity_id','duration_secs']),
    supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', athleteId).maybeSingle(),
  ])
  if (profile.error) throw new Error(`Calibration profile read failed: ${profile.error.code}`)
  const conditions = new Map<number, any>()
  for (let offset = 0; offset < runs.length; offset += 200) {
    const { data, error } = await supabaseAdmin.from('activity_conditions').select('activity_id,wbgt_approx_c,temp_c')
      .eq('athlete_id', athleteId).in('activity_id', runs.slice(offset, offset + 200).map(r => r.id))
    if (error) throw new Error(`Calibration weather read failed: ${error.code}`)
    for (const row of data ?? []) conditions.set(row.activity_id, row)
  }
  return { runs, efforts, conditions, maxHr: profile.data?.max_hr ?? 195 }
}
export async function loadAthleteCalibration(athleteId: number, asOf = new Date()) {
  return athleteCalibration(await loadCalibrationCorpus(athleteId, asOf), asOf, marathonEnduranceEnabled())
}
