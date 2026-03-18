import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'

export interface BriefingContent {
  weekly_summary: string
  shoutouts: Array<{
    athlete_name: string
    award_label: string
    caption: string
    award_icon: string
  }>
  group_momentum: 'rising' | 'steady' | 'dipping'
  coach_tip: string
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const athleteId = cookies().get('athlete_id')?.value
  if (!athleteId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data: membership } = await supabaseAdmin
    .from('group_members')
    .select('role')
    .eq('group_id', params.id)
    .eq('athlete_id', parseInt(athleteId))
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const myRole = membership.role
  const force = req.nextUrl.searchParams.get('force') === 'true' && myRole === 'admin'

  // Check cache
  if (!force) {
    const { data: cached } = await supabaseAdmin
      .from('group_coach_briefings')
      .select('content_json, generated_at')
      .eq('group_id', params.id)
      .maybeSingle()

    if (cached) {
      const age = Date.now() - new Date(cached.generated_at).getTime()
      if (age < 20 * 60 * 60 * 1000) {
        return NextResponse.json({
          briefing: cached.content_json as BriefingContent,
          cached: true,
          generated_at: cached.generated_at,
        })
      }
    }
  }

  // Generate fresh briefing
  try {
    const ctx = await buildCoachContext(params.id)

    const systemPrompt = `You are RDCoach — AI running coach for ${ctx.group.name}.
Playful, slightly snarky, competitive, genuinely encouraging underneath.
Use real names and real numbers. Notice effort, patterns, and who's slacking.
Return ONLY a JSON object matching this exact interface — no markdown, no code fences:
{
  "weekly_summary": "2-3 sentence group overview",
  "shoutouts": [
    {
      "athlete_name": "first name only",
      "award_label": "e.g. Mileage Monster, Speed Demon, Comeback Kid",
      "caption": "1-2 snarky/encouraging sentences with specific data",
      "award_icon": "one emoji"
    }
  ],
  "group_momentum": "rising" | "steady" | "dipping",
  "coach_tip": "one tactical sentence for the week ahead"
}
Rules:
- 2-4 shoutouts. At least one per member who ran this week.
- Reference specific paces, distances, run types from the data.
- If someone hasn't run in a week, call it out gently with their name.
- coach_tip must be specific to what you see in the data — no generic advice.
- group_momentum: rising if volume trending up, dipping if down, steady otherwise.`

    const userPrompt = `Today: ${ctx.today}
Group data:
${JSON.stringify(ctx, null, 2)}`

    const raw = await claudeMessage({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    let briefing: BriefingContent
    try {
      briefing = JSON.parse(text)
    } catch (parseErr) {
      console.error('[coach/briefing/parse]', raw)
      return NextResponse.json({ error: 'Coach returned unparseable response.' }, { status: 503 })
    }

    // Upsert into cache
    await supabaseAdmin
      .from('group_coach_briefings')
      .upsert({
        group_id: params.id,
        content_json: briefing,
        generated_at: new Date().toISOString(),
        generated_by: parseInt(athleteId),
      }, { onConflict: 'group_id' })

    const { data: row } = await supabaseAdmin
      .from('group_coach_briefings')
      .select('generated_at')
      .eq('group_id', params.id)
      .single()

    return NextResponse.json({
      briefing,
      cached: false,
      generated_at: row?.generated_at ?? new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[coach/briefing]', msg)
    return NextResponse.json({ error: 'Coach is taking a rest day.', detail: msg }, { status: 503 })
  }
}
