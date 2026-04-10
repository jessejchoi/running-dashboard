/**
 * POST /api/admin/backfill-latest-estimates
 *
 * One-time backfill: runs analysis for every athlete and populates
 * user_latest_estimates. Safe to re-run — uses upsert.
 * Requires athlete_id cookie (any authenticated user can trigger it,
 * but it processes all athletes so only use from admin context).
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { updateLatestEstimates } from '@/lib/latestEstimates'

export async function POST() {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

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

export const GET = POST
