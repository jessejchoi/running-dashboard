import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabaseAdmin
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

// Mock buildAthleteContext
vi.mock('@/lib/coachContext', () => ({
  buildAthleteContext: vi.fn(),
}))

// Mock claudeMessage
vi.mock('@/lib/claude', () => ({
  claudeMessage: vi.fn(),
}))

import { generateCoachNote } from '@/lib/coachNote'
import { supabaseAdmin } from '@/lib/supabase'
import { buildAthleteContext } from '@/lib/coachContext'
import { claudeMessage } from '@/lib/claude'

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>

function makeChain(returnVal: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const methods = ['select', 'eq', 'maybeSingle', 'upsert', 'insert', 'single']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain['maybeSingle'] = vi.fn().mockResolvedValue(returnVal)
  chain['upsert'] = vi.fn().mockResolvedValue({ error: null })
  chain['insert'] = vi.fn().mockResolvedValue({ error: null })
  return chain
}

const MOCK_CTX = {
  name: 'Jesse',
  recent_runs: [{ type: 'easy', date: '2026-04-01', pace_per_km: '5:30', distance_km: 8 }],
  goals: [{ label: '5K', days_to_race: 30 }],
  this_week_km: 25,
  streak: 3,
  avg_weekly_km_4w: 40,
}

const MOCK_RUN = {
  id: 1,
  athlete_id: 123,
  start_date: '2026-04-03T10:00:00Z',
  distance: 8000,
  moving_time: 2640,
  average_speed: 2.85,
  average_heartrate: 150,
  run_type: 'easy',
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(buildAthleteContext as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CTX)
  ;(claudeMessage as ReturnType<typeof vi.fn>).mockResolvedValue('Good easy run, Jesse.')
})

describe('generateCoachNote — cache behavior', () => {
  it('returns cached content when cache exists and force is not set', async () => {
    const chain = makeChain({ data: { content: 'cached note' }, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await generateCoachNote(1, 123)

    expect(result).toBe('cached note')
    expect(claudeMessage).not.toHaveBeenCalled()
  })

  it('bypasses cache when force:true', async () => {
    // First call: activities query; second call: upsert
    const cacheChain = makeChain({ data: null, error: null })
    const runChain = makeChain({ data: MOCK_RUN, error: null })
    const upsertChain = makeChain({ data: null, error: null })

    mockFrom
      .mockReturnValueOnce(runChain)      // activities fetch
      .mockReturnValueOnce(upsertChain)   // upsert

    const result = await generateCoachNote(1, 123, { force: true })

    expect(claudeMessage).toHaveBeenCalledOnce()
    expect(result).toBe('Good easy run, Jesse.')
  })
})

describe('generateCoachNote — opts injection', () => {
  it('injects perceivedEffort into the prompt', async () => {
    const runChain = makeChain({ data: MOCK_RUN, error: null })
    const upsertChain = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(runChain)
      .mockReturnValueOnce(upsertChain)

    await generateCoachNote(1, 123, { force: true, perceivedEffort: 'Hard' })

    const callArgs = (claudeMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('Hard')
    expect(callArgs.system).toContain('athlete has added their own context')
  })

  it('injects athleteNote into the prompt', async () => {
    const runChain = makeChain({ data: MOCK_RUN, error: null })
    const upsertChain = makeChain({ data: null, error: null })
    mockFrom
      .mockReturnValueOnce(runChain)
      .mockReturnValueOnce(upsertChain)

    await generateCoachNote(1, 123, { force: true, athleteNote: 'Legs felt heavy' })

    const callArgs = (claudeMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.messages[0].content).toContain('Legs felt heavy')
  })

  it('no opts — behaves the same as undefined opts (checks cache)', async () => {
    const chain = makeChain({ data: { content: 'cached' }, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await generateCoachNote(1, 123)
    expect(result).toBe('cached')
    expect(claudeMessage).not.toHaveBeenCalled()
  })
})
