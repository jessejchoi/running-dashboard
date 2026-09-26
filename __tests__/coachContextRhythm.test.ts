import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/coachData', () => ({
  recentCoachRuns: vi.fn(async () => ({ data: [] })),
  canonicalTotals: vi.fn(async () => ({})),
}))
vi.mock('@/lib/latestEstimates', () => ({ getGroupLatestEstimates: vi.fn(async () => ({})) }))
vi.mock('@/lib/timezone', () => ({
  athleteTimezone: vi.fn(async () => 'Asia/Jakarta'),
  athleteTimezones: vi.fn(async (ids: number[]) => Object.fromEntries(ids.map(id => [id, 'Asia/Jakarta']))),
}))
vi.mock('@/lib/rhythmData', () => ({ loadRhythmSummaries: vi.fn() }))

import { supabaseAdmin } from '@/lib/supabase'
import { createQueryChain } from '@/__tests__/helpers/supabase'
import { loadRhythmSummaries } from '@/lib/rhythmData'
import { buildAthleteContext } from '@/lib/coachContext'

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>
const mockRhythm = loadRhythmSummaries as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mockFrom.mockImplementation((table: string) =>
    createQueryChain({ data: table === 'strava_tokens' ? { athlete_name: 'Jesse Choi' } : [], error: null }))
})

describe('buildAthleteContext streak (Rhythm)', () => {
  it('passes the Rhythm streak and label through, and reads as untracked when Rhythm fails to load', async () => {
    mockRhythm.mockResolvedValueOnce({ launchWeek: '2026-10-05', byAthlete: { 7: { streak: 1, seasonWeek: 2 } } })
    const live = await buildAthleteContext(7)
    expect(mockRhythm).toHaveBeenCalledWith([7])
    expect(live.streak).toBe(1)
    expect(live.streak_label).toContain('Rhythm streak 1 week (')
    expect(live.streak_label).toContain('season week 2')

    // Pre-launch: the athlete has no result yet.
    mockRhythm.mockResolvedValueOnce({ launchWeek: '2026-10-05', byAthlete: { 7: null } })
    expect((await buildAthleteContext(7)).streak_label).toBe('weekly streak not tracked yet')

    // Coaching copy must not fail because Rhythm couldn't load.
    mockRhythm.mockRejectedValueOnce(new Error('rhythm_weeks timeout'))
    const fallback = await buildAthleteContext(7)
    expect(fallback.name).toBe('Jesse Choi')
    expect(fallback.streak).toBe(0)
    expect(fallback.streak_label).toBe('weekly streak not tracked yet')
    expect(console.error).toHaveBeenCalledWith('[coach] Rhythm unavailable', expect.any(Error))
  })
})
