import { supabaseAdmin } from '@/lib/supabase'
import { buildAthleteContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'
import { speedToPace } from '@/lib/utils'

export interface CoachNoteOpts {
  perceivedEffort?: string
  athleteNote?: string
  force?: boolean
}

/**
 * Generates and persists a coach note for a given run.
 * Returns the note content, or null if generation fails.
 * By default checks run_coach_notes cache first — pass force:true to bypass.
 */
export async function generateCoachNote(
  runId: number,
  athleteId: number,
  opts?: CoachNoteOpts
): Promise<string | null> {
  // Check cache (unless force:true)
  if (!opts?.force) {
    const { data: existing } = await supabaseAdmin
      .from('run_coach_notes')
      .select('content')
      .eq('run_id', runId)
      .maybeSingle()

    if (existing) return existing.content
  }

  // Fetch the run
  const { data: run } = await supabaseAdmin
    .from('activities')
    .select('id, athlete_id, start_date, distance, moving_time, average_speed, average_heartrate, run_type')
    .eq('id', runId)
    .eq('athlete_id', athleteId)
    .maybeSingle()

  if (!run) return null

  // Build athlete context
  let ctx
  try {
    ctx = await buildAthleteContext(athleteId)
  } catch {
    return null
  }

  // Compute how this run's pace compares to recent average of same type
  const sameTypeRuns = ctx.recent_runs.filter(r => r.type === run.run_type && r.date !== run.start_date?.slice(0, 10))
  let paceComparisonNote = ''
  if (sameTypeRuns.length > 0) {
    const avgPaceSecsArr = sameTypeRuns.map(r => {
      const [m, s] = r.pace_per_km.split(':').map(Number)
      return m * 60 + s
    })
    const avgPaceSecs = avgPaceSecsArr.reduce((a, b) => a + b, 0) / avgPaceSecsArr.length
    const thisPaceStr = speedToPace(run.average_speed, 'km')
    const [tm, ts] = thisPaceStr.split(':').map(Number)
    const thisPaceSecs = tm * 60 + ts
    const diff = avgPaceSecs - thisPaceSecs
    if (Math.abs(diff) > 5) {
      paceComparisonNote = diff > 0
        ? `This was ${Math.round(diff)}s/km faster than their recent ${run.run_type ?? 'run'} average.`
        : `This was ${Math.round(-diff)}s/km slower than their recent ${run.run_type ?? 'run'} average.`
    }
  }

  const nextRace = ctx.goals.length > 0
    ? ctx.goals.reduce((a, b) => (a.days_to_race < b.days_to_race ? a : b))
    : null

  const runContext = {
    run_type: run.run_type,
    distance_km: Math.round((run.distance / 1000) * 10) / 10,
    pace_per_km: speedToPace(run.average_speed, 'km'),
    avg_hr: run.average_heartrate ?? null,
    pace_comparison: paceComparisonNote || null,
    next_race: nextRace
      ? { label: nextRace.label, days_away: nextRace.days_to_race }
      : null,
    perceived_effort: opts?.perceivedEffort ?? null,
    athlete_note: opts?.athleteNote ?? null,
  }

  const effortContext = opts?.perceivedEffort
    ? `\nAthlete reported effort: ${opts.perceivedEffort}`
    : ''
  const noteContext = opts?.athleteNote
    ? `\nAthlete's note: "${opts.athleteNote}"`
    : ''

  const systemPrompt = `You are RDCoach. Give 2-3 sentences of specific coaching feedback on this run. Use the athlete's name. Reference specific numbers. Connect it to their race goal. Be direct, a touch snarky, genuinely encouraging. No generic praise.${effortContext || noteContext ? ' The athlete has added their own context — acknowledge it specifically.' : ''}`

  const userPrompt = `Athlete: ${ctx.name}
Run data: ${JSON.stringify(runContext)}
Athlete context: this week ${ctx.this_week_km}km, streak ${ctx.streak} weeks, avg weekly km (4w) ${ctx.avg_weekly_km_4w}km${effortContext}${noteContext}`

  let content: string
  try {
    content = await claudeMessage({
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 200,
    })
  } catch {
    return null
  }

  // Persist to cache (upsert so force:true overwrites)
  await supabaseAdmin
    .from('run_coach_notes')
    .upsert(
      {
        run_id: runId,
        athlete_id: athleteId,
        content,
        generated_at: new Date().toISOString(),
        ...(opts?.perceivedEffort !== undefined ? { perceived_effort: opts.perceivedEffort } : {}),
        ...(opts?.athleteNote !== undefined ? { athlete_note: opts.athleteNote } : {}),
      },
      { onConflict: 'run_id' }
    )

  return content
}
