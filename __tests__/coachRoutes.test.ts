vi.mock('@/lib/groupCoach', () => ({ getBriefing: vi.fn() }))
import { getBriefing } from '@/lib/groupCoach'
vi.mock('@/lib/auth', () => ({ getAthleteId: vi.fn(async () => '123') }))
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
import { GET as getBriefingRoute } from '@/app/api/groups/[id]/coach/briefing/route'

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
  it('serves the cached service result without generating on the request', async () => {
    queueSupabaseTables(mockFrom, createQueryChain({data:{role:'member'}}))
    vi.mocked(getBriefing).mockResolvedValue({briefing:{weekly_summary:'Saved briefing'},cached:true,generated_at:'2026-09-13',refreshing:true} as any)
    const response = await getBriefingRoute(new NextRequest('http://localhost/api/groups/g/coach/briefing'), {params:{id:'g'}})
    expect(response.status).toBe(200)
    expect((await response.json()).refreshing).toBe(true)
    expect(claudeMessage).not.toHaveBeenCalled()
  })
  it('denies non-members before reading coaching history', async () => {
    queueSupabaseTables(mockFrom, createQueryChain({data:null}))
    const response = await getBriefingRoute(new NextRequest('http://localhost/api/groups/g/coach/briefing'), {params:{id:'g'}})
    expect(response.status).toBe(403)
    expect(getBriefing).not.toHaveBeenCalled()
  })
})
