import { queueAthleteWork, runWorker } from '@/lib/worker'
import { startHistory } from '@/lib/history'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncActivities } from '@/lib/strava'

export const maxDuration = 60 // seconds (requires Vercel Pro; free plan caps at 10s)

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (or an authorized caller)
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all connected athletes
  const { data: tokens, error } = await supabaseAdmin.rpc('next_sync_athletes')

  if (error || !tokens?.length) {
    return NextResponse.json({ ok: true, synced: 0, athletes: 0 })
  }

  const results: { athleteId: number; newRuns: number; error?: string }[] = []

  const started=Date.now()
  const deadline = started + 25000
  for (const { athlete_id } of tokens) {
    if (Date.now() > deadline) break
    try {
      const newRuns = await syncActivities(athlete_id)
      await supabaseAdmin.from('athlete_state').upsert({athlete_id,last_sync_at:new Date().toISOString()},{onConflict:'athlete_id'})
      await startHistory(athlete_id)
      await queueAthleteWork(athlete_id)
      results.push({ athleteId: athlete_id, newRuns })
    } catch (err) {
      results.push({ athleteId: athlete_id, newRuns: 0, error: String(err) })
      await supabaseAdmin.from('athlete_state').upsert({athlete_id,last_sync_at:new Date().toISOString()},{onConflict:'athlete_id'})
    }
  }

  await runWorker({ budgetMs: Math.max(0,Math.min(20000,50000-(Date.now()-started))) })
  const totalNewRuns = results.reduce((sum, r) => sum + r.newRuns, 0)
  console.log(`[cron/sync] ${tokens.length} athletes, ${totalNewRuns} new runs`, results)

  return NextResponse.json({
    ok: true,
    athletes: tokens.length,
    totalNewRuns,
    results,
  })
}
