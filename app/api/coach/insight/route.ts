import { getAthleteId } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildAthleteContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'
import { normalizeInsightContent } from '@/lib/coachOutputs'
import { persistCoachAuditEvent } from '@/lib/coachMetrics'

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export async function GET() {
  const athleteId = await getAthleteId()
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const numericId = parseInt(athleteId)

  // Check cache
  const { data: cached } = await supabaseAdmin
    .from('athlete_insight_cache')
    .select('content, generated_at')
    .eq('athlete_id', numericId)
    .maybeSingle()

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime()
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ content: cached.content, generated_at: cached.generated_at, cached: true })
    }
  }

  // Generate fresh insight
  let ctx
  try {
    ctx = await buildAthleteContext(numericId)
  } catch {
    return NextResponse.json({ error: 'Could not load athlete context.' }, { status: 503 })
  }

  const systemPrompt = `You are RDCoach — a direct, slightly snarky AI running coach.
Analyze this athlete's canonical coach facts and recent training patterns.
Give exactly 2-3 sentences of specific, data-driven pattern observations.
No generic advice. Reference actual numbers (paces, distances, run types).
Only use numbers present in the provided coach facts, coach signals, and recent runs. Do not infer YTD/month/week totals yourself.
Be direct. Be a touch snarky. Find what's real — something they might not have noticed.
No greeting, no sign-off. Just the observation.`

  const userPrompt = `Athlete: ${ctx.name}
Coach facts (canonical source of truth):
${JSON.stringify(ctx.facts, null, 2)}
Coach signals:
${JSON.stringify(ctx.signals, null, 2)}
Recent runs (last ~4 weeks): ${JSON.stringify(ctx.recent_runs.slice(0, 20), null, 2)}
This week: ${ctx.this_week_km}km, YTD: ${ctx.ytd_km}km, ${ctx.streak_label}, avg weekly km (4w): ${ctx.avg_weekly_km_4w}km
Goals: ${JSON.stringify(ctx.goals.map(g => ({ label: g.label, days_to_race: g.days_to_race })))}`

  let content: string
  try {
    const rawContent = await claudeMessage({
      model: 'claude-haiku-4-5-20251001',
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: 200,
    })
    const normalized = normalizeInsightContent(rawContent)
    if (!normalized) throw new Error('Empty coach insight')
    content = normalized
  } catch {
    return NextResponse.json({ error: 'Coach is unavailable.' }, { status: 503 })
  }

  const generatedAt = new Date().toISOString()

  await supabaseAdmin
    .from('athlete_insight_cache')
    .upsert({ athlete_id: numericId, content, generated_at: generatedAt }, { onConflict: 'athlete_id' })

  await persistCoachAuditEvent({
    scope: 'athlete',
    route: 'coach/insight',
    athlete_id: numericId,
    facts: ctx.facts,
    signals: ctx.signals,
  })

  return NextResponse.json({ content, generated_at: generatedAt, cached: false, coach_facts: ctx.facts })
}
