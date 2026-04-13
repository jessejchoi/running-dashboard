import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {},
}))

describe('estimateSnapshots', () => {
  it('uses the nearest earlier snapshot when exact weekly/monthly dates are missing', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))

    const { buildAllDeltas } = await import('@/lib/estimateSnapshots')

    const current = { '5k': 1400, '10k': null, 'hm': null, 'fm': null }
    const byDate = {
      '2026-04-03': { '5k': 1420 },
      '2026-03-10': { '5k': 1450 },
      '2026-01-20': { '5k': 1500 },
    }

    const deltas = buildAllDeltas(current, byDate)

    expect(deltas['5k'].week).toBe(-20)
    expect(deltas['5k'].month).toBe(-50)
    expect(deltas['5k'].quarter).toBe(-100)

    vi.useRealTimers()
  })

  it('falls back to a slightly later snapshot when no earlier one exists nearby', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13T12:00:00Z'))

    const { buildAllDeltas } = await import('@/lib/estimateSnapshots')

    const current = { '5k': 1400, '10k': null, 'hm': null, 'fm': null }
    const byDate = {
      '2026-04-07': { '5k': 1415 },
    }

    const deltas = buildAllDeltas(current, byDate)

    expect(deltas['5k'].week).toBe(-15)
    expect(deltas['5k'].month).toBeNull()

    vi.useRealTimers()
  })
})
