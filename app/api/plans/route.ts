import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  loadPlan,
  saveManualSession,
  commitPlan,
  adaptPlan,
} from '@/lib/planService'
import { validatePreferences, type PlanSession } from '@/lib/planning'
function failure(e: unknown) {
  const message = e instanceof Error ? e.message : 'Could not save plan'
  return NextResponse.json(
    { error: message },
    { status: message.includes('STALE_VERSION') ? 409 : 400 },
  )
}
export async function GET() {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await loadPlan(Number(id)))
  } catch (e) {
    return failure(e)
  }
}
export async function POST(req: NextRequest) {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const aid = Number(id)
  try {
    const b = await req.json()
    if (b.action === 'preferences') {
      const config = validatePreferences(b.config)
      const { error } = await supabaseAdmin.rpc('save_training_preferences', {
        p_athlete: aid,
        p_version: b.version,
        p_config: config,
      })
      if (error) throw error
    } else if (b.action === 'generate') {
      await adaptPlan(aid, true)
    } else if (b.action === 'undo') {
      const plan = await loadPlan(aid)
      if (b.version !== plan.version) throw new Error('STALE_VERSION')
      const { data: r, error } = await supabaseAdmin
        .from('plan_revisions')
        .select('*')
        .eq('athlete_id', aid)
        .eq('version', b.version)
        .single()
      if (error || !r) throw new Error('Revision not found')
      if (!String(r.reason).includes('based on'))
        throw new Error('Only the latest coach revision can be undone')
      const before = r.before_json as PlanSession[],
        after = r.after_json as PlanSession[]
      // Undo is a deliberate manual decision: lock restored sessions until explicitly regenerated.
      const changed = before
        .filter(
          (s) =>
            JSON.stringify(s) !==
            JSON.stringify(after.find((a) => a.id === s.id)),
        )
        .map((s) => ({ ...s, locked: true, source: 'manual' as const }))
      const added = after
        .filter((s) => !before.some((a) => a.id === s.id))
        .map((s) => s.id)
      await commitPlan(aid, b.version, changed, added, 'Undo coach revision')
    } else if (['link', 'unlink', 'skip', 'lock'].includes(b.action)) {
      const plan = await loadPlan(aid),
        session = plan.sessions.find((s) => s.id === b.id)
      if (!session) throw new Error('Session not found')
      if (b.action === 'link') {
        const { data: run, error } = await supabaseAdmin
          .from('activities')
          .select('id')
          .eq('id', b.activity_id)
          .eq('athlete_id', aid)
          .eq('type', 'Run')
          .single()
        if (error || !run) throw new Error('Run not found')
        session.activity_id = run.id
        session.status = 'completed'
      }
      if (b.action === 'unlink') {
        session.activity_id = null
        session.matching_disabled = true
        session.status = 'planned'
      }
      if (b.action === 'skip') {
        session.activity_id = null
        session.status = 'skipped'
      }
      session.locked = true
      await commitPlan(
        aid,
        b.version,
        [session],
        [],
        `Athlete ${b.action} action`,
      )
    } else await saveManualSession(aid, b)
    return GET()
  } catch (e) {
    return failure(e)
  }
}
export async function DELETE(req: NextRequest) {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const b = await req.json()
    if (!b.id || !Number.isInteger(b.version))
      throw new Error('Session id and current version required')
    await commitPlan(Number(id), b.version, [], [b.id], 'Deleted a workout')
    return GET()
  } catch (e) {
    return failure(e)
  }
}
