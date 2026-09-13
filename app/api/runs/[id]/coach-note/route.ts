import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { generateCoachNote } from '@/lib/coachNote'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const runId = parseInt(params.id)
  const numericAthleteId = parseInt(athleteId)

  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  // Check cache
  const { data: cached } = await supabaseAdmin
    .from('run_coach_notes')
    .select('content, generated_at, perceived_effort, athlete_note')
    .eq('run_id', runId)
    .maybeSingle()

  if (cached) {
    return NextResponse.json({
      content: cached.content,
      generated_at: cached.generated_at,
      perceived_effort: cached.perceived_effort ?? null,
      athlete_note: cached.athlete_note ?? null,
    })
  }

  // Verify run belongs to this athlete
  const { data: run } = await supabaseAdmin
    .from('activities')
    .select('id')
    .eq('id', runId)
    .eq('athlete_id', numericAthleteId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const content = await generateCoachNote(runId, numericAthleteId)

  if (!content) {
    return NextResponse.json({ error: 'Could not generate note' }, { status: 503 })
  }

  return NextResponse.json({ content, generated_at: new Date().toISOString(), perceived_effort: null, athlete_note: null })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const runId = parseInt(params.id)
  const numericAthleteId = parseInt(athleteId)

  if (isNaN(runId)) return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 })

  // Verify run belongs to this athlete
  const { data: run } = await supabaseAdmin
    .from('activities')
    .select('id')
    .eq('id', runId)
    .eq('athlete_id', numericAthleteId)
    .maybeSingle()

  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  let body: { perceivedEffort?: string; athleteNote?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const content = await generateCoachNote(runId, numericAthleteId, {
    perceivedEffort: body.perceivedEffort,
    athleteNote: body.athleteNote,
    force: true,
  })

  if (!content) {
    return NextResponse.json({ error: 'Could not generate note' }, { status: 503 })
  }

  return NextResponse.json({
    content,
    generated_at: new Date().toISOString(),
    perceived_effort: body.perceivedEffort ?? null,
    athlete_note: body.athleteNote ?? null,
  })
}
