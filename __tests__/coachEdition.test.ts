import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/coachContext', () => ({ buildCoachContext: vi.fn() }))
vi.mock('@/lib/jobs', () => ({ enqueueJob: vi.fn(), claimJob: vi.fn(), finishJob: vi.fn() }))
vi.mock('@/lib/claude', () => ({ claudeMessage: vi.fn() }))
import { supabaseAdmin } from '@/lib/supabase'
import { buildCoachContext, type CoachContext } from '@/lib/coachContext'
import { claimJob, enqueueJob, finishJob } from '@/lib/jobs'
import { claudeMessage } from '@/lib/claude'
import { buildEditionPlan, editionWindow, type EditionRun } from '@/lib/coachEdition'
import { allowedNumbers, editionPrompt, grounded, resolveEdition } from '@/lib/coachEditionCopy'
import { composeBriefing, editionCopyKey, getBriefing, groupCoachModelVersion, groupVersion, previousCoachFocus, runBriefingJob } from '@/lib/groupCoach'
import { GET, POST, PATCH, DELETE } from '@/app/api/groups/[id]/shared-runs/route'
import { createQueryChain } from './helpers/supabase'

const member = (athlete_id: number, name: string, extra: Partial<CoachContext['members'][number]> = {}) => ({
  athlete_id, name, streak: 0, goals: [], current_estimates: [], this_week_km: 0, this_month_km: 0, ytd_km: 0,
  rolling_4w_km: 0, rolling_12w_km: 0, run_count_this_week: 0, recent_runs: [], ...extra,
})
const run = (athlete_id: number, date: string, km: number, extra: Partial<EditionRun> = {}): EditionRun => ({
  athlete_id, start_date: `${date}T01:00:00Z`, distance: km * 1000, moving_time: km * 330, run_type: 'easy', ...extra,
})
// Four prior weeks at a steady 20 km/week for each athlete, so baselines are 20 km.
const baseline = (id: number) => ['2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07'].map(d => run(id, d, 20))

function makeCtx(today: string, runs: EditionRun[]): CoachContext {
  return {
    group: { name: 'Track Rats' }, today, facts: {} as any, totals: {}, signals: [], active_challenges: [],
    members: [
      member(1, 'Budi Santoso', { goals: [{ label: 'Jakarta 10K', distance_key: '10k', target_secs: 2700, current_secs: 2760, days_to_race: 12 }] }),
      member(2, 'Andi Wijaya', { this_week_km: 6, run_count_this_week: 1 }),
      member(3, 'Rina Putri'),
      member(4, 'Dewi Lestari'),
    ],
    runs,
  } as CoachContext
}

// Recap of Sep 14–20: Budi spikes to 42 km, Andi (19) edges Rina (18.6), Dewi ghosts.
const recapRuns = [
  ...[1, 2, 3, 4].flatMap(baseline),
  run(1, '2026-09-14', 12), run(1, '2026-09-16', 10), run(1, '2026-09-20', 20),
  run(2, '2026-09-15', 8), run(2, '2026-09-17', 6, { run_type: 'tempo', moving_time: 6 * 270 }), run(2, '2026-09-19', 5),
  run(3, '2026-09-15', 9), run(3, '2026-09-18', 9.6),
  run(2, '2026-09-21', 6),
]

beforeEach(() => { vi.clearAllMocks() })

describe('editionWindow', () => {
  it('recaps the finished week early in the week and checks in on the current week later', () => {
    expect(editionWindow('2026-09-21')).toEqual({ mode: 'recap', week_start: '2026-09-14', week_end: '2026-09-20', as_of: '2026-09-20' })
    expect(editionWindow('2026-09-24')).toMatchObject({ mode: 'midweek', week_start: '2026-09-21', as_of: '2026-09-24' })
  })
})

describe('buildEditionPlan', () => {
  const plan = buildEditionPlan(makeCtx('2026-09-21', recapRuns), recapRuns)

  it('covers the finished week with a ticker for the current one', () => {
    expect(plan).toMatchObject({ mode: 'recap', total_km: 79.6, total_runs: 8, active_members: 3, ticker: { km: 6, runs: 1 } })
  })

  it('turns a runaway leader into the headline instead of repeating it as a beat', () => {
    expect(plan.headline.fallback).toContain('Budi ran 42.0 km')
    expect(plan.beats.map(b => b.key)).not.toContain('leader')
  })

  it('finds spike, rivalry, race and ghost beats from the week', () => {
    const keys = plan.beats.map(b => b.key)
    expect(keys).toEqual(expect.arrayContaining(['spike', 'rivalry', 'race', 'ghost']))
    expect(plan.beats.find(b => b.key === 'spike')?.facts).toMatchObject({ name: 'Budi', km: '42.0', usual_km: '20.0' })
    expect(plan.beats.find(b => b.key === 'rivalry')?.names).toEqual(['Andi', 'Rina'])
    expect(plan.beats.find(b => b.key === 'race')?.facts).toMatchObject({ race: 'Jakarta 10K', days: 12, phase: 'taper', estimate: '1:00 behind target' })
    expect(plan.beats.find(b => b.key === 'ghost')?.names).toEqual(['Dewi'])
  })

  it('gives every member a roll call line, sorted by distance', () => {
    expect(plan.roll_call.map(r => [r.name, r.state])).toEqual([['Budi', 'leader'], ['Andi', 'steady'], ['Rina', 'steady'], ['Dewi', 'ghost']])
  })

  it('spreads awards so nobody collects more than one', () => {
    expect(plan.awards.map(a => [a.award_key, a.athlete_name])).toEqual([
      ['mileage_monster', 'Budi'], ['speed_demon', 'Andi'],
    ])
    expect(new Set(plan.awards.map(a => a.athlete_id)).size).toBe(plan.awards.length)
  })

  it('sets the number to beat from the finished week', () => {
    expect(plan.mission.facts).toEqual({ target_km: '79.6' })
  })

  it('handles an empty group without inventing anyone', () => {
    const empty = buildEditionPlan({ ...makeCtx('2026-09-24', []), members: [] }, [])
    expect(empty).toMatchObject({ total_km: 0, total_runs: 0, beats: [], roll_call: [], awards: [] })
    expect(empty.headline.fallback).toMatch(/^0 runs/)
  })

  it('tells a midweek group how far it is from last week', () => {
    const mid = buildEditionPlan(makeCtx('2026-09-24', recapRuns), recapRuns)
    expect(mid.mission.facts).toEqual({ needed_km: '73.6', last_week_km: '79.6' })
  })
})

describe('grounding', () => {
  const opts = { numbers: allowedNumbers({ km: '42.0', usual_km: '20.0' }), names: ['Budi'], members: ['Budi', 'Andi', 'Rina', 'Dewi'], maxLen: 200 }

  it('accepts lines that only use the item\'s own numbers, including rounded ones', () => {
    expect(grounded('Budi hit 42 km against a usual 20.0. Easy week next.', opts)).toBeTruthy()
  })

  it('rejects invented numbers, spelled-out numbers, other members and off-limits jabs', () => {
    expect(grounded('Budi ran 110% of his usual.', opts)).toBeNull()
    expect(grounded('Budi ran three times his usual.', opts)).toBeNull()
    expect(grounded('Budi out-ran Andi by miles.', opts)).toBeNull()
    expect(grounded('Budi, mind the injury.', opts)).toBeNull()
    expect(grounded('**Budi** is on fire', opts)).toBeNull()
    expect(grounded('Budi hit 42 km, his best week.', opts)).toBeNull()
  })

  it('keeps each rejected item on its template while accepting the rest', () => {
    const plan = buildEditionPlan(makeCtx('2026-09-21', recapRuns), recapRuns)
    const resolved = resolveEdition(plan, {
      headline: 'Budi logged 42 km and the rest of you logged excuses.',
      lines: [{ beat: 'spike', text: 'Budi went 99 km. Nope.' }],
      mission: 'Beat 79.6 km this week. Easy runs count.',
      roll_call: [{ athlete_id: 4, text: 'Dewi has vanished. Rina has questions.' }],
      award_captions: [{ award_key: 'mileage_monster', text: '42 km of pure stubbornness.' }],
    }, ['Budi', 'Andi', 'Rina', 'Dewi'])
    expect(resolved.headline).toBe('Budi logged 42 km and the rest of you logged excuses.')
    expect(resolved.lines[plan.beats.findIndex(b => b.key === 'spike')]).toBe(plan.beats.find(b => b.key === 'spike')!.fallback)
    expect(resolved.mission).toBe('Beat 79.6 km this week. Easy runs count.')
    expect(resolved.roll_call.find(r => r.athlete_id === 4)?.line).toBe(plan.roll_call.find(r => r.athlete_id === 4)!.fallback)
    expect(resolved.award_captions.mileage_monster).toBe('42 km of pure stubbornness.')
  })

  it('reads as templates alone and never mentions plans or meeting up', () => {
    const ctx = makeCtx('2026-09-21', recapRuns)
    const brief = composeBriefing(buildEditionPlan(ctx, recapRuns), ctx, null)
    expect(brief.edition?.voice).toBe('template')
    expect(brief.edition?.roll_call).toHaveLength(4)
    expect(JSON.stringify(brief)).not.toMatch(/personal plan|workouts through|meet up|shared run/i)
  })
})

describe('briefing jobs', () => {
  it('versions the new edition so older briefings are replaced', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: 'version', error: null } as any)
    expect(await groupVersion('g')).toBe('version')
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('group_input_version', { p_group: 'g', p_model: groupCoachModelVersion() })
    expect(groupCoachModelVersion()).toContain(':weekly-edition-v2')
  })

  it('serves a templated edition while an old-format briefing refreshes', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: 'current-version', error: null } as any)
    vi.mocked(buildCoachContext).mockResolvedValue(makeCtx('2026-09-21', recapRuns))
    vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({ data: { input_version: 'old', content_json: { weekly_summary: 'Old plan copy', weekly_edition: {} } }, error: null }) as any)
    const result = await getBriefing('g')
    expect(result.refreshing).toBe(true)
    expect(result.briefing.edition.roll_call).toHaveLength(4)
    expect(result.briefing.weekly_summary).not.toContain('Old plan copy')
    expect(enqueueJob).toHaveBeenCalledWith('briefing', 'g', 'current-version')
  })

  it('reuses a current edition without rebuilding it', async () => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue({ data: 'current-version', error: null } as any)
    vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({ data: { input_version: 'current-version', generated_at: '2026-09-21', content_json: { edition: { headline: 'Saved' } } }, error: null }) as any)
    const result = await getBriefing('g')
    expect(result).toMatchObject({ refreshing: false, briefing: { edition: { headline: 'Saved' } } })
    expect(enqueueJob).not.toHaveBeenCalled()
    expect(buildCoachContext).not.toHaveBeenCalled()
  })

  it('commits grounded model copy and replaces the finished week\'s awards', async () => {
    const job = { id: 'job', scope: 'g', input_version: 'v', lease_token: 'lease' }
    vi.mocked(claimJob).mockResolvedValue(job as any)
    vi.mocked(supabaseAdmin.rpc).mockImplementation(((name: string) =>
      Promise.resolve({ data: name === 'group_input_version' ? 'v' : true, error: null })) as any)
    vi.mocked(buildCoachContext).mockResolvedValue(makeCtx('2026-09-21', recapRuns))
    vi.mocked(claudeMessage).mockResolvedValue(JSON.stringify({
      headline: 'Budi ran 42 km. Everyone else, please see me.', lines: [], mission: 'Nope, 500 km.', roll_call: [], award_captions: [],
    }))
    const tables: Record<string, ReturnType<typeof createQueryChain>> = {}
    vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => (tables[table] ??= createQueryChain({ data: null, error: null }))) as any)

    await runBriefingJob('job')

    expect(finishJob).toHaveBeenCalledWith(job)
    const content = vi.mocked(supabaseAdmin.rpc).mock.calls.find(c => c[0] === 'commit_briefing')![1] as any
    expect(content.p_content.edition.headline).toBe('Budi ran 42 km. Everyone else, please see me.')
    expect(content.p_content.edition.mission).toContain('79.6 km')
    expect(content.p_content.edition.voice).toBe('mixed')
    expect(tables.group_member_awards.delete).toHaveBeenCalled()
    expect(tables.group_member_awards.eq).toHaveBeenCalledWith('week_start', '2026-09-14')
    expect(tables.group_member_awards.upsert.mock.calls[0][0].map((r: any) => [r.athlete_id, r.award_key]))
      .toEqual([[1, 'mileage_monster'], [2, 'speed_demon']])
  })

  it('stores the model copy with the fingerprint of its input', async () => {
    vi.mocked(claimJob).mockResolvedValue({ id: 'job', scope: 'g', input_version: 'v', lease_token: 'l' } as any)
    vi.mocked(supabaseAdmin.rpc).mockImplementation(((name: string) =>
      Promise.resolve({ data: name === 'group_input_version' ? 'v' : false, error: null })) as any)
    const ctx = makeCtx('2026-09-21', recapRuns)
    vi.mocked(buildCoachContext).mockResolvedValue(ctx)
    const copy = { headline: 'Budi ran 42 km. Discuss.', lines: [], mission: '', roll_call: [], award_captions: [] }
    vi.mocked(claudeMessage).mockResolvedValue(JSON.stringify(copy))
    vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({ data: null, error: null }) as any)
    await runBriefingJob('job')
    const content = vi.mocked(supabaseAdmin.rpc).mock.calls.find(c => c[0] === 'commit_briefing')![1] as any
    expect(content.p_content.copy_cache).toEqual({ key: editionCopyKey(editionPrompt(buildEditionPlan(ctx, recapRuns), 'Track Rats')), copy })
  })

  it('reuses the stored copy instead of calling the model when the input is unchanged', async () => {
    vi.mocked(claimJob).mockResolvedValue({ id: 'job', scope: 'g', input_version: 'v2', lease_token: 'l' } as any)
    vi.mocked(supabaseAdmin.rpc).mockImplementation(((name: string) =>
      Promise.resolve({ data: name === 'group_input_version' ? 'v2' : false, error: null })) as any)
    // A recap ignores this week's runs, so a new Monday run leaves the model input untouched.
    const before = makeCtx('2026-09-21', recapRuns)
    const withNewRun = [...recapRuns, run(3, '2026-09-21', 7)]
    const after = { ...makeCtx('2026-09-21', withNewRun), members: before.members.map(m => m.athlete_id === 3 ? { ...m, this_week_km: 7, run_count_this_week: 1 } : m) }
    const key = editionCopyKey(editionPrompt(buildEditionPlan(before, recapRuns), 'Track Rats'))
    expect(editionCopyKey(editionPrompt(buildEditionPlan(after, withNewRun), 'Track Rats'))).toBe(key)
    const copy = { headline: 'Budi ran 42 km. Discuss.', lines: [], mission: '', roll_call: [], award_captions: [] }
    vi.mocked(buildCoachContext).mockResolvedValue(after)
    vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({ data: { content_json: { copy_cache: { key, copy } } }, error: null }) as any)
    await runBriefingJob('job')
    expect(claudeMessage).not.toHaveBeenCalled()
    const content = vi.mocked(supabaseAdmin.rpc).mock.calls.find(c => c[0] === 'commit_briefing')![1] as any
    expect(content.p_content.edition.headline).toBe('Budi ran 42 km. Discuss.')
    expect(content.p_content.edition.ticker).toEqual({ km: 13, runs: 2 })
    expect(content.p_content.copy_cache.key).toBe(key)
  })

  it('falls back to templates when the model is unavailable', async () => {
    vi.mocked(claimJob).mockResolvedValue({ id: 'job', scope: 'g', input_version: 'v', lease_token: 'l' } as any)
    vi.mocked(supabaseAdmin.rpc).mockImplementation(((name: string) =>
      Promise.resolve({ data: name === 'group_input_version' ? 'v' : false, error: null })) as any)
    vi.mocked(buildCoachContext).mockResolvedValue(makeCtx('2026-09-24', recapRuns))
    vi.mocked(claudeMessage).mockRejectedValue(new Error('timeout'))
    vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({ data: null, error: null }) as any)
    await runBriefingJob('job')
    const content = vi.mocked(supabaseAdmin.rpc).mock.calls.find(c => c[0] === 'commit_briefing')![1] as any
    expect(content.p_content.edition).toMatchObject({ mode: 'midweek', voice: 'template' })
    expect(content.p_content.copy_cache).toBeUndefined()
    expect(supabaseAdmin.from).not.toHaveBeenCalledWith('group_member_awards')
  })
})

describe('retired plan coordination', () => {
  it('gives the coach its previous focus without reading training plans', async () => {
    const focus = { focus: 'Easy days easy', evidence: {}, updated_at: '2026-09-20T00:00:00Z' }
    vi.mocked(supabaseAdmin.from).mockReturnValue(createQueryChain({ data: focus, error: null }) as any)
    expect(await previousCoachFocus('g')).toEqual(focus)
    expect(vi.mocked(supabaseAdmin.from).mock.calls.map(c => c[0])).toEqual(['coach_memory'])
  })

  it('rejects all retired shared-run operations for old clients', async () => {
    for (const handler of [GET, POST, PATCH, DELETE]) expect(handler().status).toBe(410)
    expect(supabaseAdmin.from).not.toHaveBeenCalled()
  })
})
