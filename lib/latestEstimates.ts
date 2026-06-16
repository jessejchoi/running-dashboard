/**
 * Helpers for user_latest_estimates — the single source of truth for each
 * athlete's current race estimates.
 *
 * Updated whenever new data arrives (Strava sync or run recategorization).
 * All pages read from here instead of running live analysis or querying
 * estimate_snapshots (which is kept only for historical delta tracking).
 */

import { supabaseAdmin } from '@/lib/supabase'
import { saveSnapshot } from '@/lib/estimateSnapshots'
import { getAthleteAnalysis } from '@/lib/analysis/service'

/**
 * Run the full analysis engine for one athlete and persist the results to
 * user_latest_estimates. Also saves today's estimate_snapshots row so the
 * delta tracking on the analysis page stays up to date.
 *
 * Safe to call fire-and-forget — catches and logs all errors internally.
 */
export async function updateLatestEstimates(athleteId: number): Promise<void> {
  try {
    const { currentEstimates: estimates } = await getAthleteAnalysis(athleteId, {
      activityColumns: '*',
    })

    await supabaseAdmin
      .from('user_latest_estimates')
      .upsert({
        athlete_id: athleteId,
        secs_5k:    estimates['5k']  ? Math.round(estimates['5k']!)  : null,
        secs_10k:   estimates['10k'] ? Math.round(estimates['10k']!) : null,
        secs_hm:    estimates['hm']  ? Math.round(estimates['hm']!)  : null,
        secs_fm:    estimates['fm']  ? Math.round(estimates['fm']!)  : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'athlete_id' })

    // Keep estimate_snapshots up to date for delta tracking (week/month/quarter)
    await saveSnapshot(athleteId, estimates)
  } catch (err) {
    console.error(`[updateLatestEstimates] athlete ${athleteId}:`, err)
  }
}

/**
 * Read the latest estimates for a group of athletes in a single query.
 * Returns a map: athleteId → { '5k': secs, '10k': secs, 'hm': secs, 'fm': secs }
 * Distances with no estimate are omitted from the inner map.
 */
export async function getGroupLatestEstimates(
  athleteIds: number[],
): Promise<Record<number, Record<string, number>>> {
  if (athleteIds.length === 0) return {}

  const since = new Date(Date.now() - 95 * 86_400_000).toISOString().slice(0, 10)

  const [{ data: latestRows }, { data: snapshotRows }] = await Promise.all([
    supabaseAdmin
      .from('user_latest_estimates')
      .select('athlete_id, secs_5k, secs_10k, secs_hm, secs_fm, updated_at')
      .in('athlete_id', athleteIds),
    supabaseAdmin
      .from('estimate_snapshots')
      .select('athlete_id, distance_key, estimated_secs, snapshotted_at')
      .in('athlete_id', athleteIds)
      .gte('snapshotted_at', since)
      .order('snapshotted_at', { ascending: false }),
  ])

  const result: Record<number, Record<string, number>> = {}
  const dates: Record<number, Record<string, string>> = {}

  function setEstimate(athleteId: number, key: string, secs: number | null, date: string | null) {
    if (secs == null) return
    const day = (date ?? '').split('T')[0]
    result[athleteId] ??= {}
    dates[athleteId] ??= {}
    if (!dates[athleteId][key] || day >= dates[athleteId][key]) {
      result[athleteId][key] = secs
      dates[athleteId][key] = day
    }
  }

  for (const row of latestRows ?? []) {
    const athleteId = row.athlete_id as number
    const updatedAt = row.updated_at as string | null
    setEstimate(athleteId, '5k', row.secs_5k, updatedAt)
    setEstimate(athleteId, '10k', row.secs_10k, updatedAt)
    setEstimate(athleteId, 'hm', row.secs_hm, updatedAt)
    setEstimate(athleteId, 'fm', row.secs_fm, updatedAt)
  }

  for (const row of snapshotRows ?? []) {
    setEstimate(
      row.athlete_id as number,
      row.distance_key as string,
      row.estimated_secs as number | null,
      row.snapshotted_at as string | null,
    )
  }

  return result
}
