import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createQueryChain, queueSupabaseTables } from '@/__tests__/helpers/supabase'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

vi.mock('@/lib/coachContext', () => ({
  buildAthleteContext: vi.fn(),
  buildCoachContext: vi.fn(),
}))

vi.mock('@/lib/claude', () => ({
  claudeMessage: vi.fn(),
}))

import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { buildAthleteContext, buildCoachContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'
import { GET as getInsight } from '@/app/api/coach/insight/route'
import { GET as getBriefing } from '@/app/api/groups/[id]/coach/briefing/route'

const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>
const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockCookies.mockReturnValue({
    get: vi.fn((key: string) => key === 'athlete_id' ? { value: '123' } : undefined),
  })
})

describe('coach insight route', () => {
  it('returns cached insight when fresh cache exists', async () => {
    queueSupabaseTables(
      mockFrom,
      createQueryChain({ data: { content: 'cached note', generated_at: new Date().toISOString() } }),
    )

    const response = await getInsight()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      content: 'cached note',
      cached: true,
    })
    expect(claudeMessage).not.toHaveBeenCalled()
  })

  it('returns 503 when coach returns empty content', async () => {
    queueSupabaseTables(
      mockFrom,
      createQueryChain({ data: null }),
    )
    ;(buildAthleteContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'Jesse',
      recent_runs: [],
      this_week_km: 30,
      streak: 2,
      avg_weekly_km_4w: 40,
      goals: [],
    })
    ;(claudeMessage as ReturnType<typeof vi.fn>).mockResolvedValue('   ')

    const response = await getInsight()
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json.error).toBe('Coach is unavailable.')
  })
})

describe('group briefing route', () => {
  it('sanitizes AI output before persisting awards', async () => {
    const membershipChain = createQueryChain({ data: { role: 'member' } })
    const cachedChain = createQueryChain({ data: null })
    const upsertChain = createQueryChain({ error: null })
    const auditChain = createQueryChain({ error: null })
    const groupMembersChain = createQueryChain({ data: [{ athlete_id: 1 }, { athlete_id: 2 }] })
    const tokensChain = createQueryChain({
      data: [
        { athlete_id: 1, athlete_name: 'Jesse Choi' },
        { athlete_id: 2, athlete_name: 'Mina Kim' },
      ],
    })
    const deleteAwardsChain = createQueryChain({ error: null })
    const insertAwardsChain = createQueryChain({ error: null })
    const finalRowChain = createQueryChain({ data: { generated_at: '2026-04-13T00:00:00Z' } })

    queueSupabaseTables(
      mockFrom,
      membershipChain,
      cachedChain,
      upsertChain,
      auditChain,
      groupMembersChain,
      tokensChain,
      deleteAwardsChain,
      insertAwardsChain,
      finalRowChain,
    )

    ;(buildCoachContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      group: { name: 'Track Rats' },
      today: '2026-04-13',
      members: [],
      active_challenges: [],
    })
    ;(claudeMessage as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({
      weekly_summary: 'Jesse finally stopped pretending recovery means threshold.',
      shoutouts: [
        { athlete_name: 'Jesse', award_label: 'Wrong Label', caption: 'Ran 48 km this week.', award_key: 'mileage_monster' },
        { athlete_name: 'Jesse', award_label: 'Mileage Monster', caption: 'Duplicate should be dropped.', award_key: 'mileage_monster' },
        { athlete_name: 'Mina', award_label: 'Bad key', caption: 'This should be dropped.', award_key: 'not_real' },
        { athlete_name: 'Mina', award_label: 'Speed Demon', caption: 'Closed with a 4:05/km rep.', award_key: 'speed_demon' },
      ],
      group_momentum: 'rocket',
      coach_tip: 'Keep the easy days easy.',
    }))

    const response = await getBriefing(
      new NextRequest('http://localhost/api/groups/group-1/coach/briefing'),
      { params: { id: 'group-1' } }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.briefing.group_momentum).toBe('steady')
    expect(json.briefing.shoutouts).toHaveLength(2)
    expect(json.briefing.shoutouts[0]).toMatchObject({
      athlete_name: 'Jesse',
      award_key: 'mileage_monster',
      award_label: 'Mileage Monster',
    })
    expect(insertAwardsChain.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        athlete_id: 1,
        award_key: 'mileage_monster',
        award_label: 'Mileage Monster',
      }),
      expect.objectContaining({
        athlete_id: 2,
        award_key: 'speed_demon',
        award_label: 'Speed Demon',
      }),
    ])
  })

  it('falls back to deterministic engagement when coach returns malformed JSON', async () => {
    const membershipChain = createQueryChain({ data: { role: 'member' } })
    const cachedChain = createQueryChain({ data: null })
    const upsertChain = createQueryChain({ error: null })
    const auditChain = createQueryChain({ error: null })
    const groupMembersChain = createQueryChain({ data: [{ athlete_id: 1 }] })
    const tokensChain = createQueryChain({ data: [{ athlete_id: 1, athlete_name: 'Jesse Choi' }] })
    const deleteAwardsChain = createQueryChain({ error: null })
    const insertAwardsChain = createQueryChain({ error: null })
    const finalRowChain = createQueryChain({ data: { generated_at: '2026-04-13T00:00:00Z' } })

    queueSupabaseTables(
      mockFrom,
      membershipChain,
      cachedChain,
      upsertChain,
      auditChain,
      groupMembersChain,
      tokensChain,
      deleteAwardsChain,
      insertAwardsChain,
      finalRowChain,
    )

    ;(buildCoachContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      group: { name: 'Track Rats' },
      today: '2026-04-13',
      facts: {},
      totals: {},
      signals: [],
      members: [
        {
          athlete_id: 1,
          name: 'Jesse Choi',
          streak: 1,
          goals: [],
          current_estimates: [],
          this_week_km: 24,
          this_month_km: 70,
          ytd_km: 400,
          rolling_4w_km: 120,
          rolling_12w_km: 280,
          run_count_this_week: 3,
          recent_runs: [],
        },
      ],
      active_challenges: [
        {
          name: 'Climb Club',
          type: 'elevation',
          start_date: '2026-04-01',
          end_date: '2026-04-30',
          total_km: 40,
          target_km: null,
          pct: 36,
          source_count: 4,
          progress_value: 360,
          target_value: 1000,
          progress_unit: 'meters_elevation',
        },
      ],
    })
    ;(claudeMessage as ReturnType<typeof vi.fn>).mockResolvedValue('not json, just chaos')

    const response = await getBriefing(
      new NextRequest('http://localhost/api/groups/group-1/coach/briefing?force=true'),
      { params: { id: 'group-1' } }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.briefing.challenge_nudge).toContain('Climb Club')
    expect(json.briefing.storylines[0]).toMatchObject({ label: 'Challenge pressure' })
    const coachCall = (claudeMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const coachPrompt = coachCall.messages[0].content
    expect(coachPrompt).toContain('Briefing input')
    expect(coachPrompt).toContain('"pct": 36')
    expect(coachPrompt).not.toContain('recent_runs')
    expect(coachPrompt).not.toContain('Coach facts')
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        content_json: expect.objectContaining({ challenge_nudge: expect.stringContaining('Climb Club') }),
      }),
      { onConflict: 'group_id' },
    )
  })

  it('keeps deterministic award winners while applying coach captions', async () => {
    const membershipChain = createQueryChain({ data: { role: 'member' } })
    const cachedChain = createQueryChain({ data: null })
    const upsertChain = createQueryChain({ error: null })
    const auditChain = createQueryChain({ error: null })
    const groupMembersChain = createQueryChain({ data: [{ athlete_id: 1 }] })
    const tokensChain = createQueryChain({ data: [{ athlete_id: 1, athlete_name: 'Jesse Choi' }] })
    const deleteAwardsChain = createQueryChain({ error: null })
    const insertAwardsChain = createQueryChain({ error: null })
    const finalRowChain = createQueryChain({ data: { generated_at: '2026-04-13T00:00:00Z' } })

    queueSupabaseTables(
      mockFrom,
      membershipChain,
      cachedChain,
      upsertChain,
      auditChain,
      groupMembersChain,
      tokensChain,
      deleteAwardsChain,
      insertAwardsChain,
      finalRowChain,
    )

    ;(buildCoachContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      group: { name: 'Track Rats' },
      today: '2026-04-13',
      facts: {},
      totals: {},
      signals: [],
      members: [
        {
          athlete_id: 1,
          name: 'Jesse Choi',
          streak: 1,
          goals: [],
          current_estimates: [],
          this_week_km: 24,
          this_month_km: 70,
          ytd_km: 400,
          rolling_4w_km: 120,
          rolling_12w_km: 280,
          run_count_this_week: 3,
          recent_runs: [],
        },
      ],
      active_challenges: [],
    })
    ;(claudeMessage as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({
      weekly_summary: 'Jesse is carrying the week; everyone else may file paperwork.',
      shoutouts: [
        { athlete_name: 'Fake', award_label: 'Speed Demon', caption: 'AI tried to invent a winner.', award_key: 'speed_demon' },
      ],
      group_momentum: 'rising',
      coach_tip: 'Make 24km the number to beat.',
    }))

    const response = await getBriefing(
      new NextRequest('http://localhost/api/groups/group-1/coach/briefing?force=true'),
      { params: { id: 'group-1' } }
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.briefing.weekly_summary).toContain('carrying the week')
    expect(json.briefing.shoutouts[0]).toMatchObject({
      athlete_name: 'Jesse',
      award_key: 'mileage_monster',
      award_label: 'Mileage Monster',
      caption: 'AI tried to invent a winner.',
    })
  })
})
