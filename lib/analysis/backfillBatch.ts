import { supabaseAdmin } from '../supabase'
import {
  fetchActivityDetail,
  fetchActivityStreams,
  getValidToken,
} from '../strava'
import { ingestActivityFeatures } from './ingest'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export interface BackfillBatchResult {
  processed: number
  refetched: number
  computed: number
  remaining: number
  hasMore: boolean
  total: number
  failures?: { id: number; step: string; error: string }[]
}

export interface BackfillBatchOpts {
  limit: number
  /** Restrict candidate set to the most recent N activities. Unset = all. */
  perAthleteCap?: number
}

/**
 * Process one batch of activities for a single athlete: re-fetch streams
 * where missing, then populate activity_best_efforts + activity_conditions.
 * Idempotent; safe to call repeatedly until `hasMore: false`.
 *
 * Pure helper — no auth, no request/response. Routes wrap it.
 */
export async function runBackfillBatch(
  athleteId: number,
  opts: BackfillBatchOpts,
): Promise<BackfillBatchResult> {
  const { limit, perAthleteCap } = opts

  let candidatesQuery = supabaseAdmin
    .from('activities')
    .select('id, start_date, moving_time, streams, raw')
    .eq('athlete_id', athleteId)
    .eq('type', 'Run')
    .order('start_date', { ascending: false })

  if (perAthleteCap) candidatesQuery = candidatesQuery.limit(perAthleteCap)

  const [{ data: candidates }, { data: attempted }] = await Promise.all([
    candidatesQuery,
    supabaseAdmin
      .from('activity_conditions')
      .select('activity_id')
      .eq('athlete_id', athleteId),
  ])

  const attemptedIds = new Set((attempted ?? []).map((c: any) => Number(c.activity_id)))

  const queue = (candidates ?? []).filter((a: any) => {
    const wasAttempted = attemptedIds.has(Number(a.id))
    const streamsComplete = a.streams && a.streams.distance != null
    return !wasAttempted || !streamsComplete
  })

  const batch = queue.slice(0, limit)
  if (batch.length === 0) {
    return { processed: 0, refetched: 0, computed: 0, remaining: 0, hasMore: false, total: queue.length }
  }

  const token = await getValidToken(athleteId)
  if (!token) throw new Error(`No valid Strava token for athlete ${athleteId}`)

  let refetched = 0
  let computed = 0
  let tokenRevoked = false   // tripped on first Strava 401; skips remaining batch
  const failures: { id: number; step: string; error: string }[] = []

  for (const a of batch) {
    // Once we've seen a 401 for this athlete, the token is dead — no point
    // burning Strava quota on the rest of the batch. Just mark as attempted
    // so the queue drains; the activity stays unprocessed until the athlete
    // reconnects and we clear the breadcrumb.
    if (tokenRevoked) {
      await supabaseAdmin.from('activity_conditions').upsert({
        activity_id: a.id,
        athlete_id: athleteId,
        source: 'unknown',
        fetched_at: new Date().toISOString(),
        fetch_error: 'skipped: athlete Strava token revoked',
      }, { onConflict: 'activity_id' })
      failures.push({ id: a.id, step: 'refetch', error: 'skipped: athlete Strava token revoked' })
      continue
    }

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
        const errMsg = e?.message ?? String(e)
        failures.push({ id: a.id, step: 'refetch', error: errMsg })
        // Record the failed attempt so this activity leaves the queue. Without
        // this, a 401/404/410 from Strava would put us in an infinite retry
        // loop — every batch fetches the same activities, fails the same way,
        // and queue length never shrinks.
        await supabaseAdmin.from('activity_conditions').upsert({
          activity_id: a.id,
          athlete_id: athleteId,
          source: 'unknown',
          fetched_at: new Date().toISOString(),
          fetch_error: `refetch failed: ${errMsg}`,
        }, { onConflict: 'activity_id' })
        if (errMsg.includes('Strava 401')) tokenRevoked = true
        continue
      }
    }

    try {
      const raw = (detail ?? a.raw ?? {}) as any
      const startLatLng = Array.isArray(raw.start_latlng) && raw.start_latlng.length === 2
        ? [raw.start_latlng[0], raw.start_latlng[1]] as [number, number]
        : null
      await ingestActivityFeatures({
        athleteId,
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
  return {
    processed: batch.length,
    refetched,
    computed,
    remaining,
    hasMore: remaining > 0,
    total: queue.length,
    failures: failures.length ? failures : undefined,
  }
}
