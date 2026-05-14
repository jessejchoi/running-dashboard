import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { buildAthleteContext } from '@/lib/coachContext'

export async function GET() {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  try {
    const ctx = await buildAthleteContext(parseInt(athleteId))
    return NextResponse.json({
      coach_facts: ctx.facts,
      coach_signals: ctx.signals,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: 'Could not load coach facts.', detail: msg }, { status: 503 })
  }
}
