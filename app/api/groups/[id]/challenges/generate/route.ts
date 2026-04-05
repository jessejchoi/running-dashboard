import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'

// Called by admin UI (manual) or cron job (automated).
// Generates one AI coach challenge for the upcoming/current month.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth: cookie-based for manual calls, CRON_SECRET header for cron
  const authHeader = req.headers.get('authorization')
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCron) {
    const athleteId = cookies().get('athlete_id')?.value
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
Return ONLY a JSON object — no markdown, no code fences:
{
  "name": "short challenge name (≤40 chars)",
  "description": "1-2 sentence description explaining why this challenge fits the group",
  "challenge_type": "group_distance" | "weekly_quota" | "fastest_effort",
  "target_meters": number or null,
  "config": {},
  "start_date": "${monthStart}",
  "end_date": "${monthEnd}"
}
Rules:
- start_date MUST be "${monthStart}", end_date MUST be "${monthEnd}"
- For group_distance: target_meters = total km for the group × 1000. Scale to group size and current volume.
- For weekly_quota: target_meters = per-person weekly km × 1000. Set config.weekly_meters = target_meters.
- For fastest_effort: target_meters = null. Set config.run_type to one of: intervals, threshold, tempo, long, easy.
- Prefer group_distance for months with clear volume goals, weekly_quota to build consistency, fastest_effort to sharpen speed.
- Do NOT duplicate recent challenges: ${JSON.stringify((existingChallenges ?? []).map(c => c.name))}.
- Make the name fun and specific to ${monthName} (e.g. "${monthName} ${year} Mileage Blitz", "Speed Week", etc.)
`

  const userPrompt = `Today: ${ctx.today}
Month: ${monthName} ${year}
Group stats:
${JSON.stringify({
  members: ctx.members.map(m => ({
    name: m.name,
    this_month_km: m.this_month_km,
    this_week_km: m.this_week_km,
    streak: m.streak,
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
    return NextResponse.json({ challenge })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[challenges/generate]', msg)
    return NextResponse.json({ error: 'Coach failed to generate a challenge.', detail: msg }, { status: 503 })
  }
}
