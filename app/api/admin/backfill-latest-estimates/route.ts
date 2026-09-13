import { getAthleteId } from '@/lib/auth'
/**
 * POST /api/admin/backfill-latest-estimates
 *
 * One-time backfill: runs analysis for every athlete and populates
 * user_latest_estimates. Safe to re-run — uses upsert.
 * Requires a verified session matching ADMIN_ATHLETE_ID.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { updateLatestEstimates } from '@/lib/latestEstimates'

export async function POST() {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if(!process.env.ADMIN_ATHLETE_ID || athleteId!==process.env.ADMIN_ATHLETE_ID) return NextResponse.json({error:'Admin access required'},{status:403})
  const { data: athletes } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id')

  const ids = (athletes ?? []).map(a => a.athlete_id as number)
  const results: { athleteId: number; status: string }[] = []

  for (const id of ids) {
    try {
      await updateLatestEstimates(id)
      results.push({ athleteId: id, status: 'ok' })
    } catch (err: any) {
      results.push({ athleteId: id, status: `error: ${err.message}` })
    }
  }

  return NextResponse.json({ processed: ids.length, results })
}

export async function GET(){return NextResponse.json({error:'Use POST'},{status:405})}
