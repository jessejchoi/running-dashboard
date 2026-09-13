import { supabaseAdmin } from '@/lib/supabase'
import { estimateObserved } from './expected'
export async function getExpectedEstimates(
  athleteId: number,
  asOf = new Date(),
) {
  const cutoff = new Date(asOf.getTime() - 60 * 86400000).toISOString()
  const { data: runs, error } = await supabaseAdmin
    .from('activities')
    .select(
      'id,start_date,distance,moving_time,elapsed_time,official_result_secs,is_race,run_type,run_type_manual,excluded_from_analysis,raw',
    )
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .gte('start_date', cutoff)
    .lt('start_date', asOf.toISOString())
    .order('start_date')
    .limit(1000)
  if (error) throw new Error('Unable to read estimate evidence')
  const efforts: any[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin
      .from('activity_best_efforts')
      .select('activity_id,duration_secs,best_pace_sec_per_km')
      .eq('athlete_id', athleteId)
      .gte('activity_start_date', cutoff)
      .lt('activity_start_date', asOf.toISOString())
      .order('activity_id')
      .order('duration_secs')
      .range(offset, offset + 499)
    if (error) throw new Error('Unable to read estimate efforts')
    efforts.push(...(data ?? []))
    if (!data || data.length < 500) break
  }
  const conditions: any[] = []
  for (let i = 0; i < (runs?.length ?? 0); i += 100) {
    const { data, error } = await supabaseAdmin
      .from('activity_conditions')
      .select('activity_id,wbgt_approx_c')
      .eq('athlete_id', athleteId)
      .in(
        'activity_id',
        runs!.slice(i, i + 100).map((r) => r.id),
      )
    if (!error) conditions.push(...(data ?? [])) // Weather is optional evidence.
  }
  const wbgt = new Map(conditions.map((c) => [c.activity_id, c.wbgt_approx_c]))
  const temperatures = (runs ?? [])
    .filter((r) => Date.parse(r.start_date) >= asOf.getTime() - 7 * 86400000)
    .map((r) => wbgt.get(r.id))
    .filter((v): v is number => typeof v === 'number')
  return estimateObserved(
    (runs ?? []).map((r) => ({ ...r, wbgt: wbgt.get(r.id) })),
    efforts,
    asOf,
    temperatures.length
      ? temperatures.reduce((a, b) => a + b, 0) / temperatures.length
      : null,
  )
}
