import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { saveSnapshot } from '@/lib/estimateSnapshots'
import {
  analyzeInputs,
  currentEstimatesFromResult,
  fetchAthleteAnalysisInputs,
  type AnalysisInputs,
} from '@/lib/analysis/service'

export async function POST() {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const id = Number(athleteId)

  // Fetch all needed activity arrays once, then replay the engine at each cutoff.
  const inputs = await fetchAthleteAnalysisInputs(id, { activityColumns: '*' })

  function analyzeAt(cutoffDate: Date): Record<string, number | null> {
    const before = (a: any) => new Date(a.start_date) <= cutoffDate
    const cutoffInputs: AnalysisInputs = {
      ...inputs,
      intervalRuns: inputs.intervalRuns.filter(before),
      thresholdRuns: inputs.thresholdRuns.filter(before),
      longRuns: inputs.longRuns.filter(before),
      easyRuns: inputs.easyRuns.filter(before),
      raceRuns: inputs.raceRuns.filter(before),
      allActivities: inputs.allActivities.filter(before),
    }

    return currentEstimatesFromResult(analyzeInputs(cutoffInputs))
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
        estimated_secs: Math.round(secs as number),
        snapshotted_at: dateStr,
      }))

    if (rows.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('estimate_snapshots')
        .upsert(rows, { onConflict: 'athlete_id,distance_key,snapshotted_at' })
      if (upsertError) {
        written.push(`${days}d ago (${dateStr}): UPSERT ERROR — ${upsertError.message}`)
      } else {
        written.push(`${days}d ago (${dateStr}): ${rows.map(r => `${r.distance_key}=${r.estimated_secs}s`).join(', ')}`)
      }
    } else {
      written.push(`${days}d ago (${dateStr}): no estimates`)
    }
  }

  // Also save today
  const todayEstimates = analyzeAt(new Date())
  await saveSnapshot(id, todayEstimates)
  written.push(`today: ${Object.entries(todayEstimates).filter(([,v])=>v!=null).map(([k,v])=>`${k}=${v}s`).join(', ')}`)

  return NextResponse.json({ ok: true, written })
}

export async function GET() {
  return POST()
}
