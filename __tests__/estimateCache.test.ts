import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryChain } from './helpers/supabase'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/analysis/service', () => ({ getAthleteAnalysis: vi.fn() }))
vi.mock('@/lib/analysis/expected-service', () => ({ getExpectedEstimates: vi.fn() }))
vi.mock('@/lib/estimateSnapshots', () => ({ fetchDeltas: vi.fn().mockResolvedValue({}) }))

import { supabaseAdmin } from '@/lib/supabase'
import { getAthleteAnalysis } from '@/lib/analysis/service'
import { loadEstimates } from '@/lib/estimates'

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('EXPECTED_ESTIMATOR_ENABLED', 'false')
  vi.mocked(supabaseAdmin.from).mockImplementation((table) => createQueryChain({
    data: table === 'athlete_state' ? { data_version: 2 } : null, error: null,
  }) as any)
  vi.mocked(getAthleteAnalysis).mockResolvedValue({ projection: { projections: [{
    distanceKey: '5k', todaySecs: 1500, idealSecs: 1450,
    p80SecsLow: 1400, p80SecsHigh: 1600, confidence: 'low',
  }] } } as any)
})

describe('dashboard estimate persistence', () => {
  it.each([
    ['legacy snapshot primary key', { data: null, error: { code: '23505' } }],
    ['concurrent activity sync', { data: false, error: null }],
  ])('returns computed estimates despite %s', async (_, result) => {
    vi.mocked(supabaseAdmin.rpc).mockResolvedValue(result as any)
    const bundle = await loadEstimates(1)
    expect(bundle.estimates[0].expectedSecs).toBe(1500)
    expect(bundle.dataVersion).toBe(2)
    expect(supabaseAdmin.rpc).toHaveBeenCalledTimes(1)
  })

  it('keeps the page usable when the cache request rejects', async () => {
    vi.mocked(supabaseAdmin.rpc).mockRejectedValue(new Error('Network unavailable'))
    await expect(loadEstimates(1)).resolves.toMatchObject({ estimates: [
      expect.objectContaining({ distanceKey: '5k', expectedSecs: 1500 }),
      expect.anything(), expect.anything(), expect.anything(),
    ] })
  })
})
