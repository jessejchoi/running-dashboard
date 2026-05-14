/**
 * GET /api/groups/[id]/estimates
 *
 * Returns race estimates for all group members.
 * For members who already have a snapshot today, returns cached values.
 * For members missing a recent snapshot, runs the analysis engine
 * (batching all DB queries across members) and saves new snapshots.
 *
 * This is designed to be called lazily (client-side on tab activation)
 * so it doesn't block the initial page render.
 */
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { analyzeAllAndCombine } from '@/lib/analysis'
import { saveSnapshot } from '@/lib/estimateSnapshots'
import { ANALYSIS_RUN_TYPES, DISTANCE_KEYS } from '@/lib/analysis/constants'
import { currentEstimatesFromResult } from '@/lib/analysis/service'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify membership
  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Get all member IDs
  const { data: membersRaw } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', params.id)

  const memberIds = (membersRaw ?? []).map(m => m.athlete_id as number)
  if (memberIds.length === 0) return NextResponse.json({})

  const today = todayStr()

  // Fetch existing snapshots for today for all members
  const { data: todaySnaps } = await supabaseAdmin
    .from('estimate_snapshots')
    .select('athlete_id, distance_key, estimated_secs')
    .in('athlete_id', memberIds)
    .eq('snapshotted_at', today)

  // Build result map and find which members need analysis
  const result: Record<number, Record<string, number>> = {}
  const hasTodaySnapshot = new Set<number>()

  for (const snap of todaySnaps ?? []) {
    const aid = snap.athlete_id as number
    result[aid] ??= {}
    result[aid][snap.distance_key as string] = snap.estimated_secs as number
    hasTodaySnapshot.add(aid)
  }

  // Members with ≥2 distances already cached are considered fresh
  const needsAnalysis = memberIds.filter(id => {
    const cached = result[id] ? Object.keys(result[id]).length : 0
    return cached < 2
  })

  if (needsAnalysis.length > 0) {
    // Batch fetch all activity data for members needing analysis — one query per type
    const [
      { data: intervalRuns },
      { data: thresholdRuns },
      { data: longRuns },
      { data: easyRuns },
      { data: recentRuns },
      { data: raceRuns },
      { data: profiles },
    ] = await Promise.all([
      supabaseAdmin.from('activities').select('*').in('athlete_id', needsAnalysis).in('run_type', ANALYSIS_RUN_TYPES.intervals).order('start_date', { ascending: false }).limit(needsAnalysis.length * 20),
      supabaseAdmin.from('activities').select('*').in('athlete_id', needsAnalysis).in('run_type', ANALYSIS_RUN_TYPES.threshold).order('start_date', { ascending: false }).limit(needsAnalysis.length * 20),
      supabaseAdmin.from('activities').select('*').in('athlete_id', needsAnalysis).in('run_type', ANALYSIS_RUN_TYPES.long).order('start_date', { ascending: false }).limit(needsAnalysis.length * 15),
      supabaseAdmin.from('activities').select('*').in('athlete_id', needsAnalysis).in('run_type', ANALYSIS_RUN_TYPES.easy).order('start_date', { ascending: false }).limit(needsAnalysis.length * 30),
      supabaseAdmin.from('activities').select('start_date,run_type,distance,athlete_id').in('athlete_id', needsAnalysis).order('start_date', { ascending: false }).limit(needsAnalysis.length * 200),
      supabaseAdmin.from('activities').select('*').in('athlete_id', needsAnalysis).eq('is_race', true).order('start_date', { ascending: false }).limit(needsAnalysis.length * 10),
      supabaseAdmin.from('user_profiles').select('athlete_id, max_hr').in('athlete_id', needsAnalysis),
    ])

    const maxHrMap: Record<number, number> = Object.fromEntries(
      (profiles ?? []).map(p => [p.athlete_id, (p.max_hr as number | null) ?? 195])
    )

    // Run analysis per member (CPU-only after the batch fetches above)
    for (const memberId of needsAnalysis) {
      try {
        const memberIntervals  = (intervalRuns  ?? []).filter(r => r.athlete_id === memberId)
        const memberThreshold  = (thresholdRuns ?? []).filter(r => r.athlete_id === memberId)
        const memberLong       = (longRuns      ?? []).filter(r => r.athlete_id === memberId)
        const memberEasy       = (easyRuns      ?? []).filter(r => r.athlete_id === memberId)
        const memberRecent     = (recentRuns    ?? []).filter(r => r.athlete_id === memberId)
        const memberRaces      = (raceRuns      ?? []).filter(r => r.athlete_id === memberId)
        const maxHr            = maxHrMap[memberId] ?? 195

        const analysis = analyzeAllAndCombine(
          memberIntervals, memberThreshold, memberLong, memberEasy,
          memberRaces, maxHr, memberRecent,
        )

        const estimates = currentEstimatesFromResult(analysis)
        for (const dk of DISTANCE_KEYS) {
          if (estimates[dk]) {
            result[memberId] ??= {}
            result[memberId][dk] = Math.round(estimates[dk])
          }
        }

        await saveSnapshot(memberId, estimates)
      } catch {
        // Skip member if analysis fails
      }
    }
  }

  return NextResponse.json(result)
}
