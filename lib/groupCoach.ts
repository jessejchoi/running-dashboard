import { supabaseAdmin } from '@/lib/supabase'
import { activeModelVersion } from '@/lib/analysis/expected'
import { buildCoachContext, type CoachContext } from '@/lib/coachContext'
import { buildGroupEngagement } from '@/lib/coachEngagement'
import type { BriefingContent, CoachEdition } from '@/lib/coachOutputs'
import { AWARD_CATEGORIES } from '@/lib/awards'
import { enqueueJob, claimJob, finishJob } from '@/lib/jobs'
import { claudeMessage } from '@/lib/claude'
import { buildEditionPlan, firstName, type EditionPlan } from '@/lib/coachEdition'
import {
  EDITION_COPY_SCHEMA,
  EDITION_SYSTEM_PROMPT,
  editionPrompt,
  parseEditionCopy,
  resolveEdition,
  type EditionCopy,
} from '@/lib/coachEditionCopy'
import { localDate, weekStart } from '@/lib/calendar'
const EDITION_MODEL = 'claude-opus-5'
export const GROUP_COACH_VERSION = 'weekly-edition-v2'
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
/** Assemble the stored briefing from the plan and whatever model copy survived grounding. */
export function composeBriefing(plan: EditionPlan, ctx: CoachContext, copy: EditionCopy | null): BriefingContent {
  const resolved = resolveEdition(plan, copy, ctx.members.map(m => firstName(m.name)))
  const byId = new Map(plan.roll_call.map(r => [r.athlete_id, r]))
  const stats = new Map(ctx.members.map(m => [m.athlete_id, m]))
  const km = (id: number) => Number(byId.get(id)?.facts.km ?? 0)
  const runs = (id: number) => Number(byId.get(id)?.facts.runs ?? 0)
  const edition: CoachEdition = {
    mode: plan.mode,
    week_start: plan.week_start,
    week_end: plan.week_end,
    as_of: plan.as_of,
    total_km: plan.total_km,
    total_runs: plan.total_runs,
    ticker: plan.ticker,
    headline: resolved.headline,
    lines: resolved.lines,
    mission: resolved.mission,
    roll_call: resolved.roll_call.map(r => ({
      athlete_id: r.athlete_id,
      name: stats.get(r.athlete_id)?.name ?? byId.get(r.athlete_id)?.name ?? '',
      km: km(r.athlete_id),
      runs: runs(r.athlete_id),
      line: r.line,
    })),
    voice: resolved.model_lines === 0 ? 'template' : resolved.model_lines === resolved.total_lines ? 'model' : 'mixed',
  }
  return {
    weekly_summary: [resolved.headline, ...resolved.lines].join(' '),
    edition,
    ask_prompts: buildGroupEngagement(ctx).ask_prompts,
    shoutouts: plan.awards.map(a => ({
      athlete_id: a.athlete_id,
      athlete_name: a.athlete_name,
      award_key: a.award_key,
      award_label: AWARD_CATEGORIES[a.award_key]?.label ?? 'Coach pick',
      caption: resolved.award_captions[a.award_key] ?? a.fallback,
    })),
    group_momentum: plan.momentum,
    coach_tip: resolved.mission,
  }
}
export async function deterministicBriefing(groupId: string) {
  const ctx = await buildCoachContext(groupId)
  const plan = buildEditionPlan(ctx, ctx.runs ?? [])
  return { brief: composeBriefing(plan, ctx, null), plan, ctx }
}
async function writeEditionCopy(plan: EditionPlan, ctx: CoachContext): Promise<EditionCopy | null> {
  try {
    const raw = await claudeMessage({
      model: EDITION_MODEL,
      max_tokens: 4000,
      effort: 'low',
      jsonSchema: EDITION_COPY_SCHEMA as unknown as Record<string, unknown>,
      fallbacks: true,
      timeoutMs: 30000,
      retries: 0,
      system: EDITION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: editionPrompt(plan, ctx.group.name) }],
    })
    return parseEditionCopy(raw)
  } catch {
    // Templated copy survives model outages and refusals.
    return null
  }
}
export async function runBriefingJob(id: string) {
  const job = await claimJob(id)
  if (!job) return
  try {
    if ((await groupVersion(job.scope)) !== job.input_version) {
      await finishJob(job)
      return
    }
    const { plan, ctx } = await deterministicBriefing(job.scope)
    const brief = composeBriefing(plan, ctx, await writeEditionCopy(plan, ctx))
    const { data: committed, error } = await supabaseAdmin.rpc(
      'commit_briefing',
      {
        p_group: job.scope,
        p_model: groupCoachModelVersion(),
        p_version: job.input_version,
        p_job: job.id,
        p_lease: job.lease_token,
        p_content: brief,
        p_focus: brief.coach_tip,
        p_evidence: { mode: plan.mode, week: plan.week_start, total_km: plan.total_km },
      },
    )
    if (error) throw error
    // Only finished weeks enter the trophy case; a late sync replaces that week's winners.
    if (committed && plan.mode === 'recap') {
      const { error: clearError } = await supabaseAdmin
        .from('group_member_awards')
        .delete()
        .eq('group_id', job.scope)
        .eq('week_start', plan.week_start)
      if (clearError) throw clearError
      const rows = brief.shoutouts.map(s => ({
        group_id: job.scope,
        athlete_id: s.athlete_id,
        award_key: s.award_key,
        award_label: s.award_label,
        week_start: plan.week_start,
        caption: s.caption,
      }))
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
  if (cache?.content_json?.edition)
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
