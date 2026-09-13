import { NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { startHistory, runHistoryJob, queueHistory } from '@/lib/history'
export async function GET() {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('history_imports')
    .select('status,imported,error,updated_at,next_attempt_at')
    .eq('athlete_id', id)
    .maybeSingle()
  return NextResponse.json(
    error
      ? { error: 'Could not read import status' }
      : (data ?? { status: 'not_started', imported: 0 }),
    { status: error ? 503 : 200 },
  )
}
export async function POST() {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const job = await startHistory(Number(id))
    if (job) await runHistoryJob(job)
    else {
      const { data } = await supabaseAdmin
        .from('background_jobs')
        .select('id')
        .eq('kind', 'history')
        .eq('scope', id)
        .eq('status', 'queued')
        .order('created_at')
        .limit(1)
      if (data?.[0]) await runHistoryJob(data[0].id)
    }
    return GET()
  } catch {
    return NextResponse.json(
      { error: 'Import is unavailable; retry shortly.' },
      { status: 503 },
    )
  }
}

export const maxDuration = 60
