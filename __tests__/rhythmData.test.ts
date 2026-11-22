import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/timezone', () => ({
  athleteTimezones: vi.fn(async (ids: number[]) => Object.fromEntries(ids.map(id => [id, 'Asia/Jakarta']))),
}))

import { supabaseAdmin } from '@/lib/supabase'
import { createQueryChain } from '@/__tests__/helpers/supabase'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { loadRhythmInputs, loadRhythmSummaries, rhythmLaunchWeek } from '@/lib/rhythmData'

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>
const LAUNCH = '2026-10-05'

/** Route supabase.from(table) calls to queued chains, in order, per table. */
function tables(queues: Record<string, Array<ReturnType<typeof createQueryChain>>>) {
  mockFrom.mockImplementation((table: string) => {
    const next = queues[table]?.shift()
    if (!next) throw new Error(`unexpected query on ${table}`)
    return next
  })
}

const page = (rows: unknown[]) => createQueryChain({ data: rows, error: null })
const run = (athlete_id: number, day: string, minutes = 40) => ({
  id: Math.random(), athlete_id, start_date: `${day}T00:00:00Z`, start_date_local: `${day}T07:00:00`, moving_time: minutes * 60,
})

beforeEach(() => {
  mockFrom.mockReset()
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
  it('loads every runner\'s runs in one query and groups them by athlete', async () => {
    const runsChain = page([run(1, '2026-10-13'), run(2, '2026-10-13'), run(2, '2026-10-14')])
    tables({ activities: [runsChain] })

    const inputs = await loadRhythmInputs([1, 2], LAUNCH)

    expect(mockFrom).toHaveBeenCalledTimes(1)
    expect(runsChain.in).toHaveBeenCalledWith('athlete_id', [1, 2])
    expect(inputs[1]).toEqual({ zone: 'Asia/Jakarta', runs: [expect.objectContaining({ athlete_id: 1 })] })
    expect(inputs[2].runs).toHaveLength(2)
    // Runs start 6 weeks (plus a day for zones) before launch, for launch week's average.
    expect(runsChain.gte).toHaveBeenCalledWith('start_date', '2026-08-23T00:00:00Z')
  })

  it('pages past the 1,000-row cap', async () => {
    const many = Array.from({ length: 500 }, () => run(1, '2026-10-13'))
    tables({ activities: [page(many), page(many), page(many.slice(0, 20))] })
    const inputs = await loadRhythmInputs([1], LAUNCH)
    expect(inputs[1].runs).toHaveLength(1020)
  })

  it('rethrows a read error', async () => {
    tables({ activities: [createQueryChain({ data: null, error: { code: '57014' } })] })
    await expect(loadRhythmInputs([1], LAUNCH)).rejects.toEqual({ code: '57014' })
  })

  it('short-circuits an empty id list without touching the database', async () => {
    expect(await loadRhythmInputs([], LAUNCH)).toEqual({})
    expect(mockFrom).not.toHaveBeenCalled()
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
    tables({ activities: [page([run(1, LAUNCH)])] })
    const live = await loadRhythmSummaries([1, 2], new Date('2026-10-07T05:00:00Z'))
    expect(live!.launchWeek).toBe(LAUNCH)
    expect(live!.byAthlete[1]).toMatchObject({ seasonWeek: 1, thisWeek: { runs: 1 } })
    expect(live!.byAthlete[2]).toMatchObject({ seasonWeek: 1, thisWeek: { runs: 0 } })

    tables({ activities: [page([])] })
    expect(await loadRhythmSummaries([1], new Date('2026-10-01T05:00:00Z'))).toMatchObject({ launchWeek: LAUNCH, byAthlete: { 1: null } })
  })

  it('counts runs that arrive after a week has ended, whenever they land', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    // Three weeks after launch week ended, its 3 runs are in the database: it's a hit.
    const pre = Array.from({ length: 6 }, (_, w) => [0, 1, 2].map(d => run(1, addDaysIso('2026-08-24', w * 7 + d)))).flat()
    const launchWeek = [0, 1, 2].map(d => run(1, addDaysIso(LAUNCH, d)))
    tables({ activities: [page([...pre, ...launchWeek])] })
    const result = await loadRhythmSummaries([1], new Date('2026-11-02T05:00:00Z'))
    expect(result!.byAthlete[1]!.history[0]).toEqual({ week: LAUNCH, state: 'on', runs: 3, target: 3 })
  })
})

function addDaysIso(day: string, n: number) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}
