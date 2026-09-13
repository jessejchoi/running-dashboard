import { supabaseAdmin } from '@/lib/supabase'
import { loadEstimates } from '@/lib/estimates'
import { activeModelVersion } from '@/lib/analysis/expected'
export async function updateLatestEstimates(athleteId: number): Promise<void> {
  try {
    await loadEstimates(athleteId)
  } catch (err) {
    console.error('[estimates]', athleteId, err)
  }
}
export async function getGroupLatestEstimates(
  athleteIds: number[],
): Promise<Record<number, Record<string, number>>> {
  if (!athleteIds.length) return {}
  const { data } = await supabaseAdmin
    .from('user_latest_estimates')
    .select(
      'athlete_id,secs_5k,secs_10k,secs_hm,secs_fm,model_version,updated_at,result_json',
    )
    .in('athlete_id', athleteIds)
    .eq('model_version', activeModelVersion())
    .gte('updated_at', new Date(Date.now() - 86400000).toISOString())
  const { data: states, error } = await supabaseAdmin
    .from('athlete_state')
    .select('athlete_id,data_version')
    .in('athlete_id', athleteIds)
  if (error) return {}
  const versions = new Map(
    (states ?? []).map((s) => [s.athlete_id, Number(s.data_version)]),
  )
  return Object.fromEntries(
    (data ?? [])
      .filter(
        (r) => r.result_json?.dataVersion === (versions.get(r.athlete_id) ?? 0),
      )
      .map((r: any) => [
        r.athlete_id,
        Object.fromEntries(
          ['5k', '10k', 'hm', 'fm']
            .filter((k) => r[`secs_${k}`] != null)
            .map((k) => [k, r[`secs_${k}`]]),
        ),
      ]),
  )
}
