import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
async function main() {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: athletes, error } = await db
    .from('strava_tokens')
    .select('athlete_id')
  if (error) throw new Error('Could not load connected athletes')
  const { error: resultColumnError } = await db
    .from('activities')
    .select('official_result_secs')
    .limit(1)
  if (resultColumnError && resultColumnError.code !== '42703')
    throw new Error('Could not inspect result evidence')
  const officialColumn = resultColumnError ? '' : ',official_result_secs'
  const result: any[] = []
  for (const { athlete_id } of athletes ?? []) {
    const runs: any[] = [],
      efforts: any[] = []
    for (let page = 0; ; page++) {
      const { data, error } = await db
        .from('activities')
        .select(
          'id,start_date,distance,moving_time,elapsed_time,is_race,run_type,run_type_manual,excluded_from_analysis,average_heartrate,raw' +
            officialColumn,
        )
        .eq('athlete_id', athlete_id)
        .eq('type', 'Run')
        .order('id')
        .range(page * 500, page * 500 + 499)
      if (error) throw new Error('Could not export activity evidence')
      runs.push(...((data as any[]) ?? []))
      if ((data ?? []).length < 500) break
    }
    for (let page = 0; ; page++) {
      const { data, error } = await db
        .from('activity_best_efforts')
        .select('activity_id,duration_secs,best_pace_sec_per_km,avg_hr')
        .eq('athlete_id', athlete_id)
        .order('activity_id')
        .order('duration_secs')
        .range(page * 500, page * 500 + 499)
      if (error) throw new Error('Could not export effort evidence')
      efforts.push(...(data ?? []))
      if ((data ?? []).length < 500) break
    }
    const { data: profile } = await db
      .from('user_profiles')
      .select('max_hr')
      .eq('athlete_id', athlete_id)
      .maybeSingle()
    result.push({
      runs: runs.map((r) => ({
        ...r,
        raw: { workout_type: r.raw?.workout_type, trainer: r.raw?.trainer },
      })),
      efforts,
      maxHr: profile?.max_hr ?? 195,
    })
  }
  const output = process.argv[2] ?? '/tmp/rundash-evaluation-corpus.json'
  writeFileSync(output, JSON.stringify(result))
  console.log(
    `Exported ${result.length} athletes to ${output}. No database changes.`,
  )
}
main().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
