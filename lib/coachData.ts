import { supabaseAdmin } from '@/lib/supabase'
export async function recentCoachRuns(ids: number[]) {
  const rows: any[] = []
  const cutoff = new Date(Date.now() - 84 * 86400000).toISOString()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseAdmin
      .from('activities')
      .select(
        'id,athlete_id,start_date,distance,moving_time,average_speed,average_heartrate,run_type,type,total_elevation_gain',
      )
      .in('athlete_id', ids)
      .eq('type', 'Run')
      .gte('start_date', cutoff)
      .order('start_date', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < 500) break
  }
  return { data: rows }
}
export async function canonicalTotals(ids: number[], ranges: any) {
  const { data, error } = await supabaseAdmin.rpc('coach_range_totals', {
    p_athletes: ids,
    p_ranges: Object.values(ranges),
  })
  if (error) throw error
  const result: Record<number, any> = {}
  for (const row of data ?? []) {
    result[row.athlete_id] ??= {}
    result[row.athlete_id][row.key] = {
      ...ranges[row.key],
      unit: 'km',
      meters: Number(row.meters),
      km: Math.round(Number(row.meters) / 100) / 10,
      source_count: Number(row.runs),
    }
  }
  return result
}
