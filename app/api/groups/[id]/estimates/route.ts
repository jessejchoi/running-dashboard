import { loadEstimates, estimateValues } from '@/lib/estimates'
import { getAthleteId } from '@/lib/auth'
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
import { saveSnapshot } from '@/lib/estimateSnapshots'
import { DISTANCE_KEYS } from '@/lib/analysis/constants'
import { getAthleteAnalysis } from '@/lib/analysis/service'
import { isCPEngineEnabled } from '@/lib/analysis/projector-service'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
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

  const result: Record<number, Record<string, number>> = {}
  for (const id of memberIds) result[id] = estimateValues(await loadEstimates(id))
  return NextResponse.json(result)
}
