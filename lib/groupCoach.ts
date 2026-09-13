import { supabaseAdmin } from '@/lib/supabase'
import { activeModelVersion } from '@/lib/analysis/expected'
import { buildCoachContext } from '@/lib/coachContext'
import { buildGroupEngagement } from '@/lib/coachEngagement'
import { type BriefingContent } from '@/lib/coachOutputs'
import { AWARD_CATEGORIES } from '@/lib/awards'
import { enqueueJob, claimJob, finishJob } from '@/lib/jobs'
import { claudeMessage } from '@/lib/claude'
import { buildWeeklyEdition } from '@/lib/weeklyEdition'
import { localDate, weekStart } from '@/lib/calendar'
export const GROUP_COACH_VERSION = 'weekly-edition-v1'
export function groupCoachModelVersion() { return `${activeModelVersion()}:${GROUP_COACH_VERSION}` }
export async function groupVersion(groupId: string) {
  const { data, error } = await supabaseAdmin.rpc('group_input_version', {
    p_group: groupId,
    p_model: groupCoachModelVersion(),
  })
  if (error) throw error
  return String(data)
}
export async function publicGroupTraining(groupId: string) {
  const { data: members, error } = await supabaseAdmin
    .from('group_members')
    .select('athlete_id')
    .eq('group_id', groupId)
  if (error) throw error
  const ids = (members ?? []).map((m) => m.athlete_id),
    today = localDate()
  const [planResult, memoryResult] =
    await Promise.all([
      supabaseAdmin
        .from('user_plans')
        .select(
          'athlete_id,plan_date,session_type,target_distance_meters,status,activity_id',
        )
        .in('athlete_id', ids)
        .gte('plan_date', weekStart(today))
        .lte('plan_date', today),
      supabaseAdmin
        .from('coach_memory')
        .select('focus,evidence,updated_at')
        .eq('group_id', groupId)
        .maybeSingle(),
    ])
  if (planResult.error) throw planResult.error
  if (memoryResult.error) throw memoryResult.error
  return {
    plans: (planResult.data ?? []).filter(p => p.session_type !== 'rest'),
    previous_focus: memoryResult.data ?? null,
  }
}
export async function deterministicBriefing(groupId: string) {
  const [ctx, training] = await Promise.all([
    buildCoachContext(groupId),
    publicGroupTraining(groupId),
  ])
  const engagement = buildGroupEngagement(ctx)
  const completed = training.plans.filter(
      (p) => p.status === 'completed',
    ).length,
    planned = training.plans.length
  const previous = training.previous_focus
  const progress = previous?.evidence?.completed as number | undefined
  const follow =
    previous &&
    previous.evidence?.week === weekStart(ctx.today) &&
    typeof progress === 'number'
      ? `${Math.max(0, completed - progress)} more planned sessions completed since the last check-in.`
      : planned ? `${completed} of ${planned} planned sessions completed this week.`
        : 'No personal workouts scheduled this week yet.'
  const candidateMembers = ctx.members
    .filter((m) => m.run_count_this_week > 0)
    .sort((a, b) => a.athlete_id - b.athlete_id)
  const selected = candidateMembers.length
    ? candidateMembers[
        Math.floor(Date.parse(ctx.today) / 86400000) % candidateMembers.length
      ]
    : null
  const memberStory = selected
    ? `${selected.name.split(' ')[0]} has ${selected.run_count_this_week} runs this week; their recent baseline is ${(selected.rolling_4w_km / 4).toFixed(1)} km per week.`
    : ''
  const edition = buildWeeklyEdition(ctx, training.plans)
  const next = 'Follow your own plan this week. Different cities, same accountability.'
  const brief: BriefingContent = {
    weekly_summary: [`${edition.total_runs} runs and ${edition.total_km.toFixed(1)} km across the group this week so far.`, follow, memberStory].filter(Boolean).join(' '),
    weekly_edition: edition,
    storylines: [
      {
        label: 'Follow-through',
        angle: follow,
        evidence: `${completed} completed / ${planned} planned`,
      },
      ...(selected
        ? [
            {
              label: 'Personal consistency',
              angle: memberStory,
              evidence: `${selected.run_count_this_week} recorded runs`,
            },
          ]
        : []),
    ],
    team_focus: next,
    challenge_nudge: engagement.challenge_nudge,
    risks: engagement.risks,
    ask_prompts: [
      'How did my week compare with my plan?',
      'What should I focus on next?',
      'What should my next training week look like?',
      'Who made consistent progress?',
    ],
    shoutouts: engagement.award_candidates.map((a) => ({
      athlete_name: a.athlete_name,
      award_key: a.award_key,
      award_label: AWARD_CATEGORIES[a.award_key]?.label ?? 'Coach pick',
      caption: a.evidence,
    })),
    group_momentum: ctx.signals.some((s) => s.key === 'group_momentum_rising')
      ? 'rising'
      : ctx.signals.some((s) => s.key === 'group_momentum_dipping')
        ? 'dipping'
        : 'steady',
    coach_tip: next,
  }
  return {
    brief,
    training,
    ctx,
    evidence: { completed, planned, week: weekStart(ctx.today) },
  }
}
// Generated style cannot modify facts: the model may select only a reviewed closing.
export const COACH_CLOSINGS = [
  'Consistency gets a vote too.',
  'Save the heroics for race day.',
  'The easy pace committee approves.',
  'See you at the next start line.',
]
export function groundedCopy(copy: string, _source: string) {
  return COACH_CLOSINGS.includes(copy.trim())
}
export async function runBriefingJob(id: string) {
  const job = await claimJob(id)
  if (!job) return
  try {
    if ((await groupVersion(job.scope)) !== job.input_version) {
      await finishJob(job)
      return
    }
    const { brief, training, ctx, evidence } = await deterministicBriefing(
      job.scope,
    )
    try {
      const copy = await claudeMessage({
        model: 'claude-sonnet-4-6',
        max_tokens: 40,
        timeoutMs: 7000,
        retries: 0,
        system:
          'Choose exactly one friendly closing from this list. Return its exact text, with no additions: ' +
          COACH_CLOSINGS.join(' | '),
        messages: [{ role: 'user', content: brief.weekly_summary }],
      })
      if (groundedCopy(copy, brief.weekly_summary))
        brief.weekly_summary += ` ${copy.trim()}`
    } catch {
      /* deterministic copy survives model outages */
    }
    const { data: committed, error } = await supabaseAdmin.rpc(
      'commit_briefing',
      {
        p_group: job.scope,
        p_model: groupCoachModelVersion(),
        p_version: job.input_version,
        p_job: job.id,
        p_lease: job.lease_token,
        p_content: brief,
        p_focus: brief.team_focus,
        p_evidence: evidence,
      },
    )
    if (error) throw error
    if (committed) {
      // Awards retain stable athlete identity; first-name collisions cannot choose a winner.
      const rows = brief.shoutouts.flatMap((s) => {
        const matches = ctx.members.filter(
          (m) => m.name.split(' ')[0] === s.athlete_name,
        )
        return matches.length === 1
          ? [
              {
                group_id: job.scope,
                athlete_id: matches[0].athlete_id,
                award_key: s.award_key,
                award_label: s.award_label,
                week_start: weekStart(ctx.today),
                caption: s.caption,
              },
            ]
          : []
      })
      if (rows.length)
        await supabaseAdmin.from('group_member_awards').upsert(rows, {
          onConflict: 'group_id,athlete_id,award_key,week_start',
        })
    }
    await finishJob(job)
  } catch (e) {
    await finishJob(job, e instanceof Error ? e.message : String(e))
  }
}
export async function getBriefing(groupId: string) {
  const version = await groupVersion(groupId)
  const { data: cache } = await supabaseAdmin
    .from('group_coach_briefings')
    .select('content_json,generated_at,input_version')
    .eq('group_id', groupId)
    .maybeSingle()
  if (cache?.input_version === version)
    return {
      briefing: cache.content_json,
      cached: true,
      generated_at: cache.generated_at,
      refreshing: false,
    }
  await enqueueJob('briefing', groupId, version)
  if (cache?.content_json?.weekly_edition)
    return {
      briefing: cache.content_json,
      cached: true,
      generated_at: cache.generated_at,
      refreshing: true,
    }
  const { brief } = await deterministicBriefing(groupId)
  return {
    briefing: brief,
    cached: false,
    generated_at: new Date().toISOString(),
    refreshing: true,
  }
}
