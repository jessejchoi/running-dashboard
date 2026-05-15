import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext, type CoachContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'
import { AWARD_CATEGORIES } from '@/lib/awards'
import { parseAndSanitizeBriefing, type BriefingContent } from '@/lib/coachOutputs'
import { getWeekStart, toJakartaDate } from '@/lib/utils'
import { persistCoachAuditEvent } from '@/lib/coachMetrics'
import { buildGroupEngagement, type CoachEngagementPlan } from '@/lib/coachEngagement'

export type { BriefingContent } from '@/lib/coachOutputs'

const VALID_AWARD_KEYS = Object.keys(AWARD_CATEGORIES).join(' | ')

function compactTotal(total: CoachContext['totals'][string] | undefined) {
  if (!total) return null
  return {
    km: total.km,
    range_start: total.range_start,
    range_end: total.range_end,
    source_count: total.source_count,
    unit: total.unit,
  }
}

function buildBriefingPromptInput(
  ctx: CoachContext,
  engagement: CoachEngagementPlan,
  baseBriefing: BriefingContent,
) {
  return {
    today: ctx.today,
    group: ctx.group,
    source_rules: {
      canonical: 'Only these totals/challenge values may be used as numbers in copy.',
      recent_activity: 'Not provided here on purpose; this briefing should not infer totals from recent slices.',
    },
    group_totals: {
      week: compactTotal(ctx.totals?.week),
      month: compactTotal(ctx.totals?.month),
      rolling_4w: compactTotal(ctx.totals?.rolling_4w),
      ytd: compactTotal(ctx.totals?.ytd),
    },
    members: (ctx.members ?? []).map(member => ({
      name: member.name.split(' ')[0] || member.name,
      this_week_km: member.this_week_km,
      run_count_this_week: member.run_count_this_week,
      ytd_km: member.ytd_km,
      streak: member.streak,
    })),
    active_challenges: (ctx.active_challenges ?? []).map(challenge => ({
      name: challenge.name,
      type: challenge.type,
      start_date: challenge.start_date,
      end_date: challenge.end_date,
      pct: challenge.pct,
      source_count: challenge.source_count,
      progress_value: challenge.progress_value,
      target_value: challenge.target_value,
      progress_unit: challenge.progress_unit,
      total_km: challenge.total_km,
      target_km: challenge.target_km,
      completed_member_weeks: challenge.completed_member_weeks,
      elapsed_member_weeks: challenge.elapsed_member_weeks,
    })),
    engagement_plan: {
      storylines: engagement.storylines.slice(0, 3),
      award_candidates: engagement.award_candidates,
      team_focus: engagement.team_focus,
      challenge_nudge: engagement.challenge_nudge,
      risks: engagement.risks.slice(0, 1),
      ask_prompts: engagement.ask_prompts,
    },
    base_briefing: {
      weekly_summary: baseBriefing.weekly_summary,
      shoutouts: baseBriefing.shoutouts,
      group_momentum: baseBriefing.group_momentum,
      coach_tip: baseBriefing.coach_tip,
    },
  }
}

function buildFallbackBriefing(engagement: CoachEngagementPlan): BriefingContent {
  const primary = engagement.storylines[0]?.angle
  const secondary = engagement.storylines.find(story => story.key !== engagement.storylines[0]?.key)?.angle
  const focus = engagement.team_focus ? `Next move: ${engagement.team_focus}` : ''
  const risk = engagement.risks[0] ? `Watch item: ${engagement.risks[0]}` : ''
  const briefingPieces = [primary, secondary, focus, risk].filter(Boolean)

  return {
    weekly_summary: briefingPieces.length > 0
      ? briefingPieces.slice(0, 3).join(' ')
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

function applyCoachCopy(base: BriefingContent, raw: string): BriefingContent {
  const parsed = parseAndSanitizeBriefing(raw)
  if (!parsed) return base

  return {
    ...base,
    weekly_summary: parsed.weekly_summary || base.weekly_summary,
    storylines: base.storylines?.map((storyline, i) => ({
      ...storyline,
      angle: parsed.storylines?.[i]?.angle || storyline.angle,
    })) ?? base.storylines,
    team_focus: parsed.team_focus || base.team_focus,
    challenge_nudge: parsed.challenge_nudge || base.challenge_nudge,
    risks: parsed.risks?.length ? parsed.risks : base.risks,
    ask_prompts: parsed.ask_prompts?.length ? parsed.ask_prompts : base.ask_prompts,
    shoutouts: base.shoutouts.length > 0
      ? base.shoutouts.map((shoutout, i) => ({
          ...shoutout,
          caption: parsed.shoutouts[i]?.caption || shoutout.caption,
        }))
      : parsed.shoutouts,
    group_momentum: parsed.group_momentum,
    coach_tip: parsed.coach_tip || base.coach_tip,
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

    const baseBriefing = buildFallbackBriefing(engagement)
    const briefingInput = buildBriefingPromptInput(ctx, engagement, baseBriefing)

    const systemPrompt = `You are RDCoach — AI running coach for ${ctx.group.name}.
Sharper, more snarky, competitive, genuinely encouraging underneath.
You sound like a track-side group coach with receipts, not a wellness newsletter.
Use real names and real numbers. Notice effort, patterns, and who's slacking.
The briefing input is canonical. Never invent totals, YTD distance, challenge progress, member volume, names, or winners. If you mention a number, it must appear in the briefing input.
The backend already owns the briefing structure. You are only improving the copy.
Return ONLY a JSON object matching this exact interface — no markdown, no code fences. If unsure, omit the field and the backend keeps its deterministic copy:
{
  "weekly_summary": "one cohesive coach briefing paragraph, 55-90 words, 3-4 sentences, using only provided facts",
  "storylines": [
    { "label": "copy the provided label", "angle": "rewrite the provided angle, same fact", "evidence": "copy the provided evidence" }
  ],
  "team_focus": "rewrite the provided team focus",
  "challenge_nudge": "rewrite the provided challenge nudge",
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
- weekly_summary is the main product. It must read like one organic coach monologue, not bullets, not a list, not separate sections, not "First/Second/Finally".
- Fold one challenge state, one leader/nudge story, and one next action into weekly_summary naturally. Do not mention every supplied item.
- Use the base briefing as the spine. Rewrite wording, never change facts.
- Do not add new storylines, awards, names, percentages, distances, or winners.
- award_key MUST be one of the exact strings listed above — no other values.
- award_label should be the human-readable name matching the award_key.
- Reference at most two numbers in weekly_summary. Keep it tight enough to fit in the dashboard card.
- If someone hasn't run in a week, call it out gently with their name.
- coach_tip must be specific to what you see in the data — no generic advice.
- group_momentum: rising if volume trending up, dipping if down, steady otherwise.`

    const userPrompt = `Briefing input:
${JSON.stringify(briefingInput, null, 2)}`

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

    const briefing = applyCoachCopy(baseBriefing, raw)

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
