import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncActivities } from '@/lib/strava'

export const maxDuration = 60 // seconds (requires Vercel Pro; free plan caps at 10s)

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron (or an authorized caller)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch all connected athletes
  const { data: tokens, error } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id')

  if (error || !tokens?.length) {
    return NextResponse.json({ ok: true, synced: 0, athletes: 0 })
  }

  const results: { athleteId: number; newRuns: number; error?: string }[] = []

  for (const { athlete_id } of tokens) {
    try {
      const newRuns = await syncActivities(athlete_id)
      results.push({ athleteId: athlete_id, newRuns })
    } catch (err) {
      results.push({ athleteId: athlete_id, newRuns: 0, error: String(err) })
    }
  }

  const totalNewRuns = results.reduce((sum, r) => sum + r.newRuns, 0)
  console.log(`[cron/sync] ${tokens.length} athletes, ${totalNewRuns} new runs`, results)

  return NextResponse.json({
    ok: true,
    athletes: tokens.length,
    totalNewRuns,
    results,
  })
}
