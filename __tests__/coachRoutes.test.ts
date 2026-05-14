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
})
