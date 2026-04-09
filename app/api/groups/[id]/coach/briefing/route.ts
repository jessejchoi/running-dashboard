import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'
import { AWARD_CATEGORIES, isValidAwardKey } from '@/lib/awards'
import { getWeekStart, toJakartaDate } from '@/lib/utils'

export interface BriefingContent {
  weekly_summary: string
  shoutouts: Array<{
    athlete_name: string
    award_label: string
    caption: string
    award_key: string
  }>
  group_momentum: 'rising' | 'steady' | 'dipping'
  coach_tip: string
}

const VALID_AWARD_KEYS = Object.keys(AWARD_CATEGORIES).join(' | ')

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

  const force = req.nextUrl.searchParams.get('force') === 'true'
  const REFRESH_MIN_MS = 4 * 60 * 60 * 1000 // 4 hours

  // Always check cache first
  const { data: cached } = await supabaseAdmin
    .from('group_coach_briefings')
    .select('content_json, generated_at')
    .eq('group_id', params.id)
    .maybeSingle()

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime()

    if (force) {
      // Rate-limit: anyone can force refresh, but only once per 4h per group
      if (age < REFRESH_MIN_MS) {
        const nextRefreshAt = new Date(new Date(cached.generated_at).getTime() + REFRESH_MIN_MS).toISOString()
        return NextResponse.json({
          briefing: cached.content_json as BriefingContent,
          cached: true,
          generated_at: cached.generated_at,
          rate_limited: true,
          next_refresh_at: nextRefreshAt,
        })
      }
    } else {
      // Normal load: serve cache if < 20h
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
      "award_label": "human-readable award name",
      "caption": "1-2 snarky/encouraging sentences with specific data",
      "award_key": "one of: ${VALID_AWARD_KEYS}"
    }
  ],
  "group_momentum": "rising" | "steady" | "dipping",
  "coach_tip": "one tactical sentence for the week ahead"
}
Rules:
- 2-4 shoutouts. At least one per member who ran this week.
- award_key MUST be one of the exact strings listed above — no other values.
- award_label should be the human-readable name matching the award_key.
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

    // Validate and drop invalid award_keys
    briefing.shoutouts = briefing.shoutouts.filter(s => {
      if (!isValidAwardKey(s.award_key)) {
        console.warn('[coach/briefing] dropping shoutout with invalid award_key:', s.award_key)
        return false
      }
      return true
    })

    const generatedAt = new Date().toISOString()

    // Upsert into cache
    await supabaseAdmin
      .from('group_coach_briefings')
      .upsert({
        group_id: params.id,
        content_json: briefing,
        generated_at: generatedAt,
        generated_by: parseInt(athleteId),
      }, { onConflict: 'group_id' })

    // Persist awards to group_member_awards
    if (briefing.shoutouts.length > 0) {
      const weekStart = getWeekStart(toJakartaDate(generatedAt))
      const weekStartStr = weekStart.toISOString().split('T')[0]

      // Fetch athlete name → ID mapping for this group
      const { data: groupMembers } = await supabaseAdmin
        .from('group_members')
        .select('athlete_id')
        .eq('group_id', params.id)

      const memberIds = (groupMembers ?? []).map(m => m.athlete_id)
      const { data: tokens } = await supabaseAdmin
        .from('strava_tokens')
        .select('athlete_id, athlete_name')
        .in('athlete_id', memberIds)

      const nameToId: Record<string, number> = {}
      for (const t of tokens ?? []) {
        const firstName = (t.athlete_name ?? '').split(' ')[0].toLowerCase()
        nameToId[firstName] = t.athlete_id
      }

      const awardRows = briefing.shoutouts
        .map(s => {
          const firstName = s.athlete_name.toLowerCase()
          const athleteIdNum = nameToId[firstName]
          if (!athleteIdNum) return null
          return {
            group_id: params.id,
            athlete_id: athleteIdNum,
            award_key: s.award_key,
            award_label: s.award_label,
            week_start: weekStartStr,
            caption: s.caption,
          }
        })
        .filter(Boolean)

      // Replace this week's awards entirely (delete + insert) so multiple refreshes don't accumulate
      await supabaseAdmin
        .from('group_member_awards')
        .delete()
        .eq('group_id', params.id)
        .eq('week_start', weekStartStr)

      if (awardRows.length > 0) {
        await supabaseAdmin
          .from('group_member_awards')
          .insert(awardRows)
      }
    }

    const { data: row } = await supabaseAdmin
      .from('group_coach_briefings')
      .select('generated_at')
      .eq('group_id', params.id)
      .single()

    return NextResponse.json({
      briefing,
      cached: false,
      generated_at: row?.generated_at ?? generatedAt,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[coach/briefing]', msg)
    return NextResponse.json({ error: 'Coach is taking a rest day.', detail: msg }, { status: 503 })
  }
}
