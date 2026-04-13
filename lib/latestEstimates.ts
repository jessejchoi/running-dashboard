/**
 * Helpers for user_latest_estimates — the single source of truth for each
 * athlete's current race estimates.
 *
 * Updated whenever new data arrives (Strava sync or run recategorization).
 * All pages read from here instead of running live analysis or querying
 * estimate_snapshots (which is kept only for historical delta tracking).
 */

import { supabaseAdmin } from '@/lib/supabase'
import { analyzeAllAndCombine } from '@/lib/analysis'
import { saveSnapshot } from '@/lib/estimateSnapshots'

const INTERVAL_TYPES  = ['intervals', 'interval_5k', 'interval_10k']
const THRESHOLD_TYPES = ['threshold', 'tempo']
const LONG_TYPES      = ['long', 'long_easy', 'long_progressive', 'long_steady']
const EASY_TYPES      = ['easy', 'easy_strides', 'long_easy', 'recovery']

/**
 * Run the full analysis engine for one athlete and persist the results to
 * user_latest_estimates. Also saves today's estimate_snapshots row so the
 * delta tracking on the analysis page stays up to date.
 *
 * Safe to call fire-and-forget — catches and logs all errors internally.
 */
export async function updateLatestEstimates(athleteId: number): Promise<void> {
  try {
    const [
      { data: intervalRuns },
      { data: thresholdRuns },
      { data: longRuns },
      { data: easyRuns },
      { data: allActivities },
      { data: raceRuns },
      { data: profile },
    ] = await Promise.all([
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', INTERVAL_TYPES).order('start_date', { ascending: false }),
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', THRESHOLD_TYPES).order('start_date', { ascending: false }),
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', LONG_TYPES).order('start_date', { ascending: false }),
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).in('run_type', EASY_TYPES).order('start_date', { ascending: false }),
      supabaseAdmin.from('activities').select('start_date, run_type, distance').eq('athlete_id', athleteId).not('run_type', 'is', null).order('start_date', { ascending: false }),
      supabaseAdmin.from('activities').select('*').eq('athlete_id', athleteId).eq('is_race', true).order('start_date', { ascending: false }),
      supabaseAdmin.from('user_profiles').select('max_hr').eq('athlete_id', athleteId).maybeSingle(),
    ])

    const maxHr = profile?.max_hr ?? 195
    const analysis = analyzeAllAndCombine(
      intervalRuns  ?? [],
      thresholdRuns ?? [],
      longRuns      ?? [],
      easyRuns      ?? [],
      raceRuns      ?? [],
      maxHr,
      allActivities ?? [],
    )

    const estimates: Record<string, number | null> = {
      '5k':  analysis.combined['5k']?.bestEstimateSecs  ?? null,
      '10k': analysis.combined['10k']?.bestEstimateSecs ?? null,
      'hm':  analysis.combined['hm']?.bestEstimateSecs  ?? null,
      'fm':  analysis.combined['fm']?.bestEstimateSecs  ?? null,
    }

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

  const { data } = await supabaseAdmin
    .from('user_latest_estimates')
    .select('athlete_id, secs_5k, secs_10k, secs_hm, secs_fm')
    .in('athlete_id', athleteIds)

  const result: Record<number, Record<string, number>> = {}
  for (const row of data ?? []) {
    const m: Record<string, number> = {}
    if (row.secs_5k)  m['5k']  = row.secs_5k
    if (row.secs_10k) m['10k'] = row.secs_10k
    if (row.secs_hm)  m['hm']  = row.secs_hm
    if (row.secs_fm)  m['fm']  = row.secs_fm
    result[row.athlete_id as number] = m
  }
  return result
}
