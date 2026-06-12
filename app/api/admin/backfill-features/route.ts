import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import {
  fetchActivityDetail,
  fetchActivityStreams,
  getValidToken,
} from '@/lib/strava'
import { ingestActivityFeatures } from '@/lib/analysis/ingest'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Vercel hobby tier caps serverless functions at 60s. With a Strava rate-limit
// floor of ~1.1s per call and 2 calls per refetch, ~25 refetches per request
// keeps us comfortably under that ceiling.
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 50

export const maxDuration = 60

/**
 * Backfill activity_best_efforts + activity_conditions across an athlete's
 * full run history. Idempotent and resumable — call repeatedly until
 * `hasMore: false`.
 *
 * For each activity in the queue:
 *   1. If streams are missing the new keys (no `distance`), refetch from
 *      Strava (this is the slow step — bounded by Strava's rate limit).
 *   2. Run ingestActivityFeatures to populate the two caches.
 *
 * Body: { limit?: number }   default 25, max 50
 * Response: { processed, refetched, computed, remaining, hasMore }
 */
export async function POST(request: NextRequest) {
  const cookieStore = cookies()
  const athleteId = cookieStore.get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const id = Number(athleteId)
  const body = await request.json().catch(() => ({}))
  const limit = Math.min(Math.max(0, body.limit ?? DEFAULT_LIMIT), MAX_LIMIT)

  const [{ data: candidates }, { data: attempted }] = await Promise.all([
    supabaseAdmin
      .from('activities')
      .select('id, start_date, moving_time, streams, raw')
      .eq('athlete_id', id)
      .eq('type', 'Run')
      .order('start_date', { ascending: false }),
    // activity_conditions gets a row on every attempt — even when Open-Meteo
    // fails or there's no GPS we write source='unknown'. So a row's presence
    // is a reliable "we've tried this activity" signal. activity_best_efforts
    // would skip the row entirely when streams don't yield efforts (treadmill,
    // no GPS, very short runs), trapping those activities in the queue.
    supabaseAdmin
      .from('activity_conditions')
      .select('activity_id')
      .eq('athlete_id', id),
  ])

  const attemptedIds = new Set((attempted ?? []).map((c: any) => Number(c.activity_id)))

  // Queue = either we've never attempted this activity, or its streams are
  // missing the new keys (re-fetch needed).
  const queue = (candidates ?? []).filter((a: any) => {
    const wasAttempted = attemptedIds.has(Number(a.id))
    const streamsComplete = a.streams && a.streams.distance != null
    return !wasAttempted || !streamsComplete
  })

  const batch = queue.slice(0, limit)
  if (batch.length === 0) {
    return NextResponse.json({
      processed: 0, refetched: 0, computed: 0,
      remaining: 0, hasMore: false, total: queue.length,
    })
  }

  const token = await getValidToken(id)
  if (!token) return NextResponse.json({ error: 'No valid Strava token' }, { status: 401 })

  let refetched = 0
  let computed = 0
  const failures: { id: number; step: string; error: string }[] = []

  for (const a of batch) {
    let streams: any = a.streams
    let detail: any = null
    const streamsComplete = streams && streams.distance != null

    if (!streamsComplete) {
      try {
        detail = await fetchActivityDetail(token, a.id)
        streams = await fetchActivityStreams(token, a.id)
        await supabaseAdmin
          .from('activities')
          .update({ streams: streams ?? null })
          .eq('id', a.id)
        refetched++
        await sleep(1100)
      } catch (e: any) {
        failures.push({ id: a.id, step: 'refetch', error: e?.message ?? String(e) })
        continue
      }
    }

    try {
      const raw = (detail ?? a.raw ?? {}) as any
      const startLatLng = Array.isArray(raw.start_latlng) && raw.start_latlng.length === 2
        ? [raw.start_latlng[0], raw.start_latlng[1]] as [number, number]
        : null
      await ingestActivityFeatures({
        athleteId: id,
        activityId: a.id,
        startDateISO: a.start_date,
        durationSecs: a.moving_time,
        startLatLng,
        stravaAverageTempC: typeof raw.average_temp === 'number' ? raw.average_temp : null,
        streams,
      })
      computed++
    } catch (e: any) {
      failures.push({ id: a.id, step: 'compute', error: e?.message ?? String(e) })
    }
  }

  const remaining = queue.length - batch.length
  return NextResponse.json({
    processed: batch.length,
    refetched,
    computed,
    remaining,
    hasMore: remaining > 0,
    total: queue.length,
    failures: failures.length ? failures : undefined,
  })
}

export async function GET(request: NextRequest) {
  return POST(request)
}
