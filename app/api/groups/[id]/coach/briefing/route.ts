import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'
import { AWARD_CATEGORIES } from '@/lib/awards'
import { parseAndSanitizeBriefing, type BriefingContent } from '@/lib/coachOutputs'
import { getWeekStart, toJakartaDate } from '@/lib/utils'
import { persistCoachAuditEvent } from '@/lib/coachMetrics'
import { buildGroupEngagement, type CoachEngagementPlan } from '@/lib/coachEngagement'

export type { BriefingContent } from '@/lib/coachOutputs'

const VALID_AWARD_KEYS = Object.keys(AWARD_CATEGORIES).join(' | ')

function buildFallbackBriefing(engagement: CoachEngagementPlan): BriefingContent {
  return {
    weekly_summary: engagement.storylines.length > 0
      ? engagement.storylines.map(story => story.angle).slice(0, 2).join(' ')
      : 'No dramatic group pattern yet. Deeply suspicious, but we will allow it.',
    storylines: engagement.storylines,
    team_focus: engagement.team_focus,
    challenge_nudge: engagement.challenge_nudge,
    risks: engagement.risks,
    ask_prompts: engagement.ask_prompts,
    shoutouts: engagement.award_candidates.slice(0, 4).map(candidate => ({
      athlete_name: candidate.athlete_name,
      award_key: candidate.award_key,
      award_label: AWARD_CATEGORIES[candidate.award_key]?.label ?? 'Coach Pick',
      caption: `${candidate.evidence}. Not bad. Try not to act shocked.`,
    })),
    group_momentum: 'steady',
    coach_tip: engagement.team_focus,
  }
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

  const force = req.nextUrl.searchParams.get('force') === 'true'

  // Always check cache first
  const { data: cached } = await supabaseAdmin
    .from('group_coach_briefings')
    .select('content_json, generated_at')
    .eq('group_id', params.id)
    .maybeSingle()

  if (cached) {
    const age = Date.now() - new Date(cached.generated_at).getTime()

    if (!force) {
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
    const engagement = buildGroupEngagement(ctx)

    const systemPrompt = `You are RDCoach — AI running coach for ${ctx.group.name}.
Sharper, more snarky, competitive, genuinely encouraging underneath.
You sound like a track-side group coach with receipts, not a wellness newsletter.
Use real names and real numbers. Notice effort, patterns, and who's slacking.
The coach facts are canonical. Never invent totals, YTD distance, challenge progress, or member volume. If you mention a number, it must appear in the facts/signals.
Return ONLY a JSON object matching this exact interface — no markdown, no code fences:
{
  "weekly_summary": "2-3 sentence group overview",
  "storylines": [
    { "label": "short storyline label", "angle": "one snarky but useful sentence", "evidence": "specific fact that supports it" }
  ],
  "team_focus": "one concrete group focus for the next 48-72 hours",
  "challenge_nudge": "one challenge-specific action sentence",
  "risks": ["0-3 short risk/nudge sentences"],
  "ask_prompts": ["4 short questions members would actually tap"],
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
- Voice: 20% more bite than before. Funny jab, useful coaching. No motivational poster sludge.
- Use the deterministic engagement plan as the spine. You may rewrite the wording, not the facts.
- storylines should be the main group drama: challenge pressure, leaderboard carrying, inactive nudges, volume/risk.
- ask_prompts should be timely and group-specific, not generic.
- 2-4 shoutouts. At least one per member who ran this week.
- Choose shoutouts from award_candidates when possible.
- award_key MUST be one of the exact strings listed above — no other values.
- award_label should be the human-readable name matching the award_key.
- Reference specific paces, distances, run types from the data.
- Prefer canonical totals from coach_facts over recent_runs; recent_runs are only narrative examples.
- If someone hasn't run in a week, call it out gently with their name.
- coach_tip must be specific to what you see in the data — no generic advice.
- group_momentum: rising if volume trending up, dipping if down, steady otherwise.`

    const userPrompt = `Today: ${ctx.today}
Coach facts (canonical source of truth):
${JSON.stringify(ctx.facts, null, 2)}
Coach signals:
${JSON.stringify(ctx.signals, null, 2)}
Deterministic engagement plan:
${JSON.stringify(engagement, null, 2)}
Group narrative context:
${JSON.stringify({
  group: ctx.group,
  members: ctx.members,
  active_challenges: ctx.active_challenges,
}, null, 2)}`

    let raw = ''
    try {
      raw = await claudeMessage({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
    } catch (err) {
      console.error('[coach/briefing/claude]', err instanceof Error ? err.message : String(err))
    }

    const parsedBriefing = parseAndSanitizeBriefing(raw)
    const briefing = parsedBriefing
      ? {
          ...parsedBriefing,
          storylines: parsedBriefing.storylines?.length ? parsedBriefing.storylines : engagement.storylines,
          team_focus: parsedBriefing.team_focus || engagement.team_focus,
          challenge_nudge: parsedBriefing.challenge_nudge || engagement.challenge_nudge,
          risks: parsedBriefing.risks?.length ? parsedBriefing.risks : engagement.risks,
          ask_prompts: parsedBriefing.ask_prompts?.length ? parsedBriefing.ask_prompts : engagement.ask_prompts,
        }
      : buildFallbackBriefing(engagement)
    if (!briefing) {
      console.error('[coach/briefing/parse]', raw)
      return NextResponse.json({ error: 'Coach returned unparseable response.' }, { status: 503 })
    }

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

    await persistCoachAuditEvent({
      scope: 'group',
      route: 'groups/coach/briefing',
      group_id: params.id,
      athlete_id: parseInt(athleteId),
      facts: ctx.facts,
      signals: ctx.signals,
    })

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
      coach_facts: ctx.facts,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[coach/briefing]', msg)
    return NextResponse.json({ error: 'Coach is taking a rest day.', detail: msg }, { status: 503 })
  }
}
