import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { groupRole, validateSharedRun } from '@/lib/sharedRuns'
async function identity(groupId: string) {
  const id = await getAthleteId()
  if (!id) return null
  const role = await groupRole(groupId, Number(id))
  return role ? { id: Number(id), role } : null
}
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const who = await identity(params.id)
  if (!who) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  const [{ data: events, error }, { data: state }] = await Promise.all([
    supabaseAdmin
      .from('shared_runs')
      .select('*')
      .eq('group_id', params.id)
      .gte('starts_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('starts_at')
      .limit(100),
    supabaseAdmin
      .from('athlete_state')
      .select('plan_version')
      .eq('athlete_id', who.id)
      .maybeSingle(),
  ])
  if (error)
    return NextResponse.json(
      { error: 'Could not load group runs' },
      { status: 503 },
    )
  const ids = (events ?? []).map((e) => e.id)
  const { data: rsvps } = ids.length
    ? await supabaseAdmin.from('shared_run_rsvps').select('*').in('run_id', ids)
    : { data: [] }
  const { data: linked, error: linkedError } = await supabaseAdmin
    .from('user_plans')
    .select('id,shared_run_id,event_changed,status')
    .eq('athlete_id', who.id)
    .in('shared_run_id', ids)
  if (linkedError)
    return NextResponse.json(
      { error: 'Could not load linked sessions' },
      { status: 503 },
    )
  return NextResponse.json({
    linked: linked ?? [],
    events: events ?? [],
    rsvps: rsvps ?? [],
    athleteId: who.id,
    role: who.role,
    planVersion: Number(state?.plan_version ?? 0),
  })
}
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const who = await identity(params.id)
  if (!who) return NextResponse.json({ error: 'Not a member' }, { status: 403 })
  try {
    const b = await req.json()
    if (b.action === 'rsvp') {
      const { error } = await supabaseAdmin.rpc('rsvp_shared_run', {
        p_group: params.id,
        p_event: b.id,
        p_actor: who.id,
        p_version: b.version,
        p_option: b.option ?? 0,
        p_join: !!b.join,
        p_add_plan: !!b.add_plan,
        p_accept_change: !!b.accept_change,
        p_plan_version: b.plan_version ?? 0,
      })
      if (error) throw error
    } else if (b.action === 'edit' || b.action === 'cancel') {
      const values = b.action === 'edit' ? validateSharedRun(b) : {}
      const { error } = await supabaseAdmin.rpc('update_shared_run', {
        p_group: params.id,
        p_event: b.id,
        p_actor: who.id,
        p_version: b.version,
        p_values: values,
        p_cancel: b.action === 'cancel',
      })
      if (error) throw error
    } else {
      const values = validateSharedRun(b)
      if (Date.parse(values.starts_at) < Date.now())
        throw new Error('Choose a future time')
      const { error } = await supabaseAdmin
        .from('shared_runs')
        .insert({ ...values, group_id: params.id, creator_id: who.id })
      if (error) throw error
    }
    return GET(req, { params })
  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : ((e as any)?.message ?? 'Could not save group run')
    return NextResponse.json(
      { error: message },
      { status: message.includes('STALE_VERSION') ? 409 : 400 },
    )
  }
}
