import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { runBackfillBatch } from '@/lib/analysis/backfillBatch'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

export const maxDuration = 60

/**
 * Backfill activity_best_efforts + activity_conditions for the currently
 * logged-in athlete. Idempotent and resumable — call repeatedly until
 * `hasMore: false`.
 *
 * Body: { limit?: number }   default 25, max 50
 * Response: { processed, refetched, computed, remaining, hasMore, total, failures? }
 */
export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const limit = Math.min(Math.max(0, body.limit ?? DEFAULT_LIMIT), MAX_LIMIT)

  try {
    const result = await runBackfillBatch(Number(athleteId), { limit })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
