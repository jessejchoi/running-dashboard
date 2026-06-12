import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { runBackfillBatch } from '@/lib/analysis/backfillBatch'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50
const DEFAULT_PER_ATHLETE_CAP = 100

export const maxDuration = 60

/**
 * Multi-athlete backfill. Processes one batch for one athlete per call —
 * iterates athletes in stored order, picks the first with remaining work,
 * runs a batch for them. Caller polls until `allDone: true`.
 *
 * Auth: ADMIN_ATHLETE_ID env var must be set and must match the caller's
 * cookie. Without that env var the route refuses, so a bad config can't
 * silently let any logged-in athlete backfill other athletes' data.
 *
 * Body: { limit?: number = 25, perAthleteCap?: number = 100 }
 * Response:
 *   - { athleteId, processed, refetched, computed, remaining, hasMore, total, failures?, allDone: false }
 *   - { allDone: true, athletes }   when every athlete's queue is empty
 */
export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const callerAthleteId = cookieStore.get('athlete_id')?.value
  const adminAthleteId = process.env.ADMIN_ATHLETE_ID
  if (!adminAthleteId) {
    return NextResponse.json(
      { error: 'ADMIN_ATHLETE_ID env var not set on the server — refusing for safety' },
      { status: 403 },
    )
  }
  if (!callerAthleteId || callerAthleteId !== adminAthleteId) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const limit = Math.min(Math.max(0, body.limit ?? DEFAULT_LIMIT), MAX_LIMIT)
  const perAthleteCap = body.perAthleteCap ?? DEFAULT_PER_ATHLETE_CAP

  const { data: athletes } = await supabaseAdmin
    .from('strava_tokens')
    .select('athlete_id')
    .order('athlete_id')

  if (!athletes?.length) {
    return NextResponse.json({ allDone: true, athletes: 0 })
  }

  for (const { athlete_id } of athletes) {
    try {
      const result = await runBackfillBatch(Number(athlete_id), { limit, perAthleteCap })
      if (result.processed > 0 || result.remaining > 0) {
        return NextResponse.json({
          athleteId: athlete_id,
          ...result,
          allDone: false,
        })
      }
    } catch (e: any) {
      // One athlete's token expired or Strava call broke — record and skip
      // so a single bad athlete doesn't stall the whole sweep.
      return NextResponse.json({
        athleteId: athlete_id,
        error: e?.message ?? String(e),
        allDone: false,
        skipped: true,
      })
    }
  }

  return NextResponse.json({ allDone: true, athletes: athletes.length })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
