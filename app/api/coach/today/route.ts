import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildAthleteContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'

export interface WorkoutSuggestion {
  run_type: 'easy' | 'interval' | 'threshold' | 'long_easy' | 'recovery'
  distance_km: number
  pace_per_km: string
  structure: string
  rationale: string
}

const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

export async function GET(req: NextRequest) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const numericAthleteId = parseInt(athleteId)
  const force = req.nextUrl.searchParams.get('force') === 'true'

  // Check cache
  if (!force) {
    const { data: cached } = await supabaseAdmin
      .from('athlete_workout_cache')
      .select('content, generated_at')
      .eq('athlete_id', numericAthleteId)
      .maybeSingle()

    if (cached) {
      const age = Date.now() - new Date(cached.generated_at).getTime()
      if (age < CACHE_TTL_MS) {
        return NextResponse.json({
          workout: cached.content,
          generated_at: cached.generated_at,
          cached: true,
        })
      }
    }
  }

  // Build athlete context
  const ctx = await buildAthleteContext(numericAthleteId)

  // No goals
  if (ctx.goals.length === 0) {
    return NextResponse.json({
      type: 'no_goals',
      message: 'Set a race goal first to get personalized workout recommendations.',
    })
  }

  // Check if race is within 2 days
  const nextRace = ctx.goals.reduce((a, b) => (a.days_to_race < b.days_to_race ? a : b))
  if (nextRace.days_to_race >= 0 && nextRace.days_to_race <= 2) {
    return NextResponse.json({
      type: 'rest',
      message: `Your ${nextRace.label} is in ${nextRace.days_to_race} day${nextRace.days_to_race === 1 ? '' : 's'} — rest and stay fresh.`,
    })
  }

  const systemPrompt = `You are RDCoach, a direct running coach. Return ONLY a JSON object:
{
  "run_type": "easy|interval|threshold|long_easy|recovery",
  "distance_km": number,
  "pace_per_km": "M:SS",
  "structure": "e.g. 6×800m @ 4:10/km w/ 90s rest",
  "rationale": "one sentence explaining why this workout today"
}
Base the recommendation on: training load, last run, days to race, weekly km so far.
If they just ran hard, prescribe easy. If they haven't run in 3+ days, start light.
No markdown. No code fences. Pure JSON only.`

  const userPrompt = `Athlete context:
${JSON.stringify(ctx, null, 2)}`

  let raw: string
  try {
    raw = await claudeMessage({
      model: 'claude-sonnet-4-6',
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 300,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[coach/today]', msg)
    return NextResponse.json({ error: 'Coach is taking a rest day.', detail: msg }, { status: 503 })
  }

  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let workout: WorkoutSuggestion
  try {
    workout = JSON.parse(text)
  } catch {
    console.error('[coach/today/parse]', raw)
    return NextResponse.json({ error: 'Coach returned unparseable response.' }, { status: 503 })
  }

  const generatedAt = new Date().toISOString()

  // Upsert cache
  await supabaseAdmin
    .from('athlete_workout_cache')
    .upsert(
      { athlete_id: numericAthleteId, content: workout, generated_at: generatedAt },
      { onConflict: 'athlete_id' }
    )

  return NextResponse.json({ workout, generated_at: generatedAt, cached: false })
}
