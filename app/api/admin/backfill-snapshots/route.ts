import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { analyzeAllAndCombine } from '@/lib/analysis'
import { saveSnapshot } from '@/lib/estimateSnapshots'

const EASY_RUN_TYPES = ['easy', 'easy_strides', 'long_easy', 'recovery']

export async function POST() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const id = Number(athleteId)

  // Fetch all needed activity arrays (no limits so we cover 90+ days back)
  const [
    { data: intervalRuns },
    { data: thresholdRuns },
    { data: longRuns },
    { data: easyRuns },
    { data: allActivities },
    { data: userProfile },
  ] = await Promise.all([
    supabaseAdmin.from('activities').select('*').eq('athlete_id', id).in('run_type', ['intervals', 'interval_5k', 'interval_10k']).order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', id).in('run_type', ['threshold', 'tempo']).order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', id).in('run_type', ['long', 'long_easy', 'long_progressive', 'long_steady']).order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('*').eq('athlete_id', id).in('run_type', EASY_RUN_TYPES).order('start_date', { ascending: false }),
    supabaseAdmin.from('activities').select('start_date, run_type, distance').eq('athlete_id', id).eq('type', 'Run').not('run_type', 'is', null).order('start_date', { ascending: false }),
    supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', id).maybeSingle(),
  ])

  let raceRuns: any[] = []
  try {
    const { data } = await supabaseAdmin.from('activities').select('*').eq('athlete_id', id).eq('is_race', true).order('start_date', { ascending: false })
    raceRuns = data ?? []
  } catch { /* column may not exist */ }

  const maxHr: number = userProfile?.max_hr ?? 195

  function analyzeAt(cutoffDate: Date): Record<string, number | null> {
    const before = (a: any) => new Date(a.start_date) <= cutoffDate
    try {
      const r = analyzeAllAndCombine(
        (intervalRuns ?? []).filter(before),
        (thresholdRuns ?? []).filter(before),
        (longRuns ?? []).filter(before),
        (easyRuns ?? []).filter(before),
        raceRuns.filter(before),
        maxHr,
        (allActivities ?? []).filter(before),
      )
      return {
        '5k':  r.combined['5k']?.bestEstimateSecs  ?? null,
        '10k': r.combined['10k']?.bestEstimateSecs ?? null,
        'hm':  r.combined['hm']?.bestEstimateSecs  ?? null,
        'fm':  r.combined['fm']?.bestEstimateSecs  ?? null,
      }
    } catch {
      return { '5k': null, '10k': null, 'hm': null, 'fm': null }
    }
  }

  const now = Date.now()
  const cutoffs: { days: number; date: Date }[] = [
    { days: 7,  date: new Date(now - 7  * 86_400_000) },
    { days: 30, date: new Date(now - 30 * 86_400_000) },
    { days: 90, date: new Date(now - 90 * 86_400_000) },
  ]

  const written: string[] = []

  for (const { days, date } of cutoffs) {
    const estimates = analyzeAt(date)
    const dateStr = date.toISOString().split('T')[0]
    const rows = (Object.entries(estimates) as [string, number | null][])
      .filter(([, v]) => v != null)
      .map(([dk, secs]) => ({
        athlete_id: id,
        distance_key: dk,
        estimated_secs: secs as number,
        snapshotted_at: dateStr,
      }))

    if (rows.length > 0) {
      await supabaseAdmin
        .from('estimate_snapshots')
        .upsert(rows, { onConflict: 'athlete_id,distance_key,snapshotted_at' })
      written.push(`${days}d ago (${dateStr}): ${rows.map(r => `${r.distance_key}=${r.estimated_secs}s`).join(', ')}`)
    } else {
      written.push(`${days}d ago (${dateStr}): no estimates`)
    }
  }

  // Also save today
  const todayEstimates = analyzeAt(new Date())
  saveSnapshot(id, todayEstimates)
  written.push(`today: ${Object.entries(todayEstimates).filter(([,v])=>v!=null).map(([k,v])=>`${k}=${v}s`).join(', ')}`)

  return NextResponse.json({ ok: true, written })
}

export async function GET(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // ?run=1 triggers the backfill
  const run = new URL(request.url).searchParams.get('run')
  if (run === '1') {
    return POST()
  }

  const { data, error } = await supabaseAdmin
    .from('estimate_snapshots')
    .select('*')
    .eq('athlete_id', Number(athleteId))
    .order('snapshotted_at', { ascending: false })

  return NextResponse.json({ rows: data ?? [], error: error?.message ?? null })
}
