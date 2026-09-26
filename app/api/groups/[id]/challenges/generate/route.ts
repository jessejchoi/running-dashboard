import { getAthleteId } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'
import { persistCoachAuditEvent } from '@/lib/coachMetrics'

// Called by admin UI (manual) or cron job (automated).
// Generates one AI coach challenge for the upcoming/current month.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth: cookie-based for manual calls, CRON_SECRET header for cron
  const authHeader = req.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const athleteId = await getAthleteId()
    if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: membership } = await supabaseAdmin
      .from('group_members')
      .select('role')
      .eq('group_id', params.id)
      .eq('athlete_id', parseInt(athleteId))
      .maybeSingle()

    if (membership?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can generate challenges' }, { status: 403 })
    }
  }

  const today = new Date()
  const thisMonth = today.toISOString().slice(0, 7) // YYYY-MM

  // Skip if a coach challenge already exists for this month
  const monthStart = `${thisMonth}-01`
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
  const monthEnd = new Date(nextMonth.getTime() - 86400000).toISOString().split('T')[0]

  const { data: existing } = await supabaseAdmin
    .from('group_challenges')
    .select('id')
    .eq('group_id', params.id)
    .eq('created_by_coach', true)
    .gte('start_date', monthStart)
    .lte('start_date', monthEnd)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ skipped: true, reason: 'Coach challenge already exists for this month' })
  }

  // Build context for Claude
  const ctx = await buildCoachContext(params.id)

  // Fetch existing challenges so AI doesn't duplicate
  const { data: existingChallenges } = await supabaseAdmin
    .from('group_challenges')
    .select('name, challenge_type, start_date, end_date')
    .eq('group_id', params.id)
    .order('start_date', { ascending: false })
    .limit(5)

  const monthName = today.toLocaleString('en-US', { month: 'long' })
  const year = today.getFullYear()

  const systemPrompt = `You are RDCoach generating a monthly group challenge for ${ctx.group.name}.
Create ONE challenge that fits the group's current fitness and is achievable but motivating.
Use only canonical coach facts for volume and member counts. Do not estimate monthly/YTD totals from recent runs.
Return ONLY a JSON object — no markdown, no code fences:
{
  "name": "short challenge name (≤40 chars)",
  "description": "1-2 sentence description explaining why this challenge fits the group",
  "challenge_type": "group_distance" | "weekly_quota" | "fastest_effort" | "elevation" | "run_count",
  "target_meters": number or null,
  "config": {},
  "start_date": "${monthStart}",
  "end_date": "${monthEnd}"
}
Challenge type guide:
- group_distance: group collectively runs a total km target. target_meters = total km × 1000 (scale to group size × monthly volume).
- weekly_quota: each member hits a per-week km target. target_meters = weekly km × 1000. Set config.weekly_meters = target_meters.
- elevation: group collectively climbs a total elevation target in meters. target_meters = total meters of elevation (e.g. 5000 for a flat-city group, 10000+ for trail runners).
- run_count: group logs a total number of runs. target_meters = total run count (e.g. 40 for a 4-person group aiming for ~10 runs/person).
- fastest_effort: fastest recorded effort by pace, using each runner's fastest manual lap or fastest 1 km split. target_meters = null. Leave config empty.
Vary the type each month — do not always pick group_distance.
Do NOT duplicate recent challenges: ${JSON.stringify((existingChallenges ?? []).map(c => c.name))}.
Make the name fun and specific to ${monthName} (e.g. "${monthName} Vertical Club", "30 Runs in ${monthName}", etc.)
`

  const userPrompt = `Today: ${ctx.today}
Month: ${monthName} ${year}
Coach facts (canonical source of truth):
${JSON.stringify(ctx.facts, null, 2)}
Coach signals:
${JSON.stringify(ctx.signals, null, 2)}
Challenge sizing stats:
${JSON.stringify({
  members: ctx.members.map(m => ({
    name: m.name,
    this_month_km: m.this_month_km,
    ytd_km: m.ytd_km,
    rolling_4w_km: m.rolling_4w_km,
    this_week_km: m.this_week_km,
    streak: m.streak_label,
  })),
  active_challenges: ctx.active_challenges,
}, null, 2)}`

  try {
    const raw = await claudeMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const generated = JSON.parse(text)

    // Validate required fields
    if (!generated.name || !generated.challenge_type || !generated.start_date || !generated.end_date) {
      return NextResponse.json({ error: 'Coach returned incomplete challenge data.' }, { status: 503 })
    }

    const { data: challenge, error } = await supabaseAdmin
      .from('group_challenges')
      .insert({
        group_id: params.id,
        name: generated.name,
        description: generated.description ?? null,
        challenge_type: generated.challenge_type,
        target_meters: generated.target_meters ?? null,
        start_date: generated.start_date,
        end_date: generated.end_date,
        config: generated.config ?? {},
        created_by: 0, // 0 = system/coach
        created_by_coach: true,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await persistCoachAuditEvent({
      scope: 'group',
      route: 'groups/challenges/generate',
      group_id: params.id,
      facts: ctx.facts,
      signals: ctx.signals,
    })
    return NextResponse.json({ challenge })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[challenges/generate]', msg)
    return NextResponse.json({ error: 'Coach failed to generate a challenge.', detail: msg }, { status: 503 })
  }
}
