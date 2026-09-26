import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { rhythmLaunchWeek } from '@/lib/rhythmData'
import { freezeRhythmWeeks } from '@/lib/rhythmLedger'

export const maxDuration = 60

const BATCH = 50

/**
 * Daily: freeze finished Rhythm weeks for EVERY connected athlete. This runs
 * apart from /api/cron/sync, which only reaches the 20 least-recently-synced
 * athletes within its time budget.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!rhythmLaunchWeek()) return NextResponse.json({ ok: true, skipped: 'rhythm off' })

  const tokens = await fetchAllPages<{ athlete_id: number }>(() => supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id')
    .order('athlete_id'))
  const ids = tokens.map(t => t.athlete_id)
  let frozen = 0
  const failed: number[] = []
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH)
    try {
      frozen += (await freezeRhythmWeeks(batch)) ?? 0
    } catch (error) {
      console.error('[cron/rhythm-freeze] batch failed', batch, error)
      failed.push(...batch)
    }
  }
  console.log(`[cron/rhythm-freeze] ${ids.length} athletes, ${frozen} weeks frozen, ${failed.length} failed`)
  return NextResponse.json({ ok: failed.length === 0, athletes: ids.length, frozen, failed })
}
