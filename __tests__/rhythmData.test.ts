import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('@/lib/timezone', () => ({
  athleteTimezones: vi.fn(async (ids: number[]) => Object.fromEntries(ids.map(id => [id, 'Asia/Jakarta']))),
}))

import { supabaseAdmin } from '@/lib/supabase'
import { createQueryChain } from '@/__tests__/helpers/supabase'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { loadRhythmInputs, loadRhythmSummaries, rhythmLaunchWeek } from '@/lib/rhythmData'

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>
const mockRpc = supabaseAdmin.rpc as ReturnType<typeof vi.fn>
const LAUNCH = '2026-10-05'

/** Route supabase.from(table) calls to queued chains, in order, per table. */
/** Route supabase.from(table) and supabase.rpc(fn) calls to queued chains, in order, per name. */
function tables(queues: Record<string, Array<ReturnType<typeof createQueryChain>>>) {
  const next = (name: string) => {
    const chain = queues[name]?.shift()
    if (!chain) throw new Error(`unexpected query on ${name}`)
    return chain
  }
  mockFrom.mockImplementation(next)
  mockRpc.mockImplementation(next)
}

const page = (rows: unknown[]) => createQueryChain({ data: rows, error: null })
const run = (athlete_id: number, day: string, minutes = 40) => ({
  id: Math.random(), athlete_id, start_date: `${day}T00:00:00Z`, start_date_local: `${day}T07:00:00`, moving_time: minutes * 60,
})

beforeEach(() => {
  mockFrom.mockReset()
  mockRpc.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('fetchAllPages', () => {
  it('keeps reading pages until one comes back short', async () => {
    const pages = [Array(500).fill({ id: 1 }), Array(500).fill({ id: 2 }), [{ id: 3 }]]
    const ranges: number[][] = []
    const rows = await fetchAllPages(() => ({
      range: (from: number, to: number) => {
        ranges.push([from, to])
        return Promise.resolve({ data: pages.shift(), error: null })
      },
    }))
    expect(rows).toHaveLength(1001)
    expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]])
  })

  it('throws the query error', async () => {
    await expect(fetchAllPages(() => ({ range: () => Promise.resolve({ data: null, error: { code: '500' } }) }))).rejects.toEqual({ code: '500' })
  })
})

describe('rhythmLaunchWeek', () => {
  it('is the feature flag: unset or not a Monday means off', () => {
    expect(rhythmLaunchWeek(undefined)).toBeNull()
    expect(rhythmLaunchWeek('2026-10-06')).toBeNull()
    expect(rhythmLaunchWeek('10/05/2026')).toBeNull()
    expect(rhythmLaunchWeek(LAUNCH)).toBe(LAUNCH)
  })
})

describe('loadRhythmInputs', () => {
  const NOW = new Date('2026-10-15T05:00:00Z')

  it('counts finished weeks in the database and loads only recent runs, grouped by athlete', async () => {
    const counts = page([
      { athlete_id: 1, week_start: LAUNCH, runs: 3 },
      { athlete_id: 2, week_start: LAUNCH, runs: 2 },
      { athlete_id: 2, week_start: '2026-10-12', runs: 1 },
    ])
    const runsChain = page([run(1, '2026-10-13'), run(2, '2026-10-13'), run(2, '2026-10-14')])
    tables({ rhythm_week_counts: [counts], activities: [runsChain] })

    const inputs = await loadRhythmInputs([1, 2], LAUNCH, NOW)

    // Counts reach 6 weeks before launch, for launch week's average, with the run-length rule passed in.
    expect(mockRpc).toHaveBeenCalledWith('rhythm_week_counts', { p_athletes: [1, 2], p_from: '2026-08-24', p_min_secs: 600 })
    expect(inputs[1]).toEqual({ zone: 'Asia/Jakarta', weeks: { [LAUNCH]: 3 }, runs: [expect.objectContaining({ athlete_id: 1 })] })
    expect(inputs[2].weeks).toEqual({ [LAUNCH]: 2, '2026-10-12': 1 })
    expect(inputs[2].runs).toHaveLength(2)
    // Individual runs only cover this week, in any zone: 8 UTC days back.
    expect(runsChain.in).toHaveBeenCalledWith('athlete_id', [1, 2])
    expect(runsChain.gte).toHaveBeenCalledWith('start_date', '2026-10-07T00:00:00Z')
  })

  it('pages both reads past the 1,000-row cap', async () => {
    const weeks = Array.from({ length: 500 }, () => ({ athlete_id: 1, week_start: LAUNCH, runs: 1 }))
    const many = Array.from({ length: 500 }, () => run(1, '2026-10-13'))
    tables({
      rhythm_week_counts: [page(weeks), page(weeks.slice(0, 3))],
      activities: [page(many), page(many), page(many.slice(0, 20))],
    })
    const inputs = await loadRhythmInputs([1], LAUNCH, NOW)
    expect(mockRpc).toHaveBeenCalledTimes(2)
    expect(inputs[1].runs).toHaveLength(1020)
  })

  it('rethrows a read error, for instance before migration 026 is applied', async () => {
    tables({ rhythm_week_counts: [createQueryChain({ data: null, error: { code: 'PGRST202' } })], activities: [page([])] })
    await expect(loadRhythmInputs([1], LAUNCH, NOW)).rejects.toEqual({ code: 'PGRST202' })
  })

  it('short-circuits an empty id list without touching the database', async () => {
    expect(await loadRhythmInputs([], LAUNCH)).toEqual({})
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

describe('loadRhythmSummaries', () => {
  it('is null while RHYTHM_LAUNCH_WEEK is unset, without touching the database', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', '')
    expect(await loadRhythmSummaries([1])).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('computes each runner live, and null before launch week', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    tables({ rhythm_week_counts: [page([{ athlete_id: 1, week_start: LAUNCH, runs: 1 }])], activities: [page([run(1, LAUNCH)])] })
    const live = await loadRhythmSummaries([1, 2], new Date('2026-10-07T05:00:00Z'))
    expect(live!.launchWeek).toBe(LAUNCH)
    expect(live!.byAthlete[1]).toMatchObject({ seasonWeek: 1, thisWeek: { runs: 1 } })
    expect(live!.byAthlete[2]).toMatchObject({ seasonWeek: 1, thisWeek: { runs: 0 } })

    tables({ rhythm_week_counts: [page([])], activities: [page([])] })
    expect(await loadRhythmSummaries([1], new Date('2026-10-01T05:00:00Z'))).toMatchObject({ launchWeek: LAUNCH, byAthlete: { 1: null } })
  })

  it('takes finished weeks from the database counts, so late runs land whenever they arrive', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    // Six pre-launch weeks at 3 set the target to 3; launch week's 3 runs make it a hit.
    const weeks = [0, 1, 2, 3, 4, 5, 6].map(i => ({ athlete_id: 1, week_start: addDaysIso('2026-08-24', i * 7), runs: 3 }))
    tables({ rhythm_week_counts: [page(weeks)], activities: [page([])] })
    const result = await loadRhythmSummaries([1], new Date('2026-11-02T05:00:00Z'))
    expect(result!.byAthlete[1]!.history[0]).toEqual({ week: LAUNCH, state: 'on', runs: 3, target: 3 })
  })
})

function addDaysIso(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}
