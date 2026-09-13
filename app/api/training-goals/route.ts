import { NextRequest, NextResponse } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { trainingGoals } from '@/lib/trainingGoals'
import { validTimezone } from '@/lib/calendar'
export async function GET() {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await trainingGoals(Number(id)))
  } catch {
    return NextResponse.json(
      { error: 'Could not load training goals' },
      { status: 503 },
    )
  }
}
export async function POST(req: NextRequest) {
  const id = await getAthleteId()
  if (!id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const b = await req.json()
    if (
      !['distance', 'runs'].includes(b.metric) ||
      !Number.isFinite(b.target) ||
      b.target <= 0 ||
      b.target > (b.metric === 'runs' ? 21 : 500000) ||
      !validTimezone(b.timezone) ||
      (b.metric === 'runs' && !Number.isInteger(b.target))
    )
      throw new Error('Invalid weekly goal')
    const { error } = await supabaseAdmin.from('training_goals').upsert(
      {
        athlete_id: Number(id),
        metric: b.metric,
        target: b.target,
        timezone: b.timezone,
        active: b.active !== false,
      },
      { onConflict: 'athlete_id,metric' },
    )
    if (error) throw error
    return GET()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not save goal' },
      { status: 400 },
    )
  }
}
