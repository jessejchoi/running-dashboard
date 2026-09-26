import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/timezone', () => ({
  athleteTimezones: vi.fn(async (ids: number[]) => Object.fromEntries(ids.map(id => [id, 'Asia/Jakarta']))),
}))

import { supabaseAdmin } from '@/lib/supabase'
import { createQueryChain } from '@/__tests__/helpers/supabase'
import { fetchAllPages } from '@/lib/fetchAllPages'
import { loadRhythmInputs, loadRhythmSummaries, rhythmLaunchWeek } from '@/lib/rhythmData'
import { freezeRhythmWeeks } from '@/lib/rhythmLedger'
import { GET as freezeCron } from '@/app/api/cron/rhythm-freeze/route'
import { NextRequest } from 'next/server'

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
  it('loads every runner in one query per table and groups rows by athlete', async () => {
    const ledgerChain = page([
      { athlete_id: 1, week_start: LAUNCH, runs: 3, avg_runs: '3.00', target: 3, state: 'on', level: 1, level_before_miss: null, redeemed: false, streak: 1, rules_version: 1 },
    ])
    const runsChain = page([run(1, '2026-10-13'), run(2, '2026-10-13'), run(2, '2026-10-14')])
    tables({ rhythm_weeks: [ledgerChain], activities: [runsChain] })

    const inputs = await loadRhythmInputs([1, 2], LAUNCH, new Date('2026-10-15T05:00:00Z'))

    expect(mockFrom).toHaveBeenCalledTimes(2)
    expect(ledgerChain.in).toHaveBeenCalledWith('athlete_id', [1, 2])
    expect(inputs![1].ledger[0]).toMatchObject({ week_start: LAUNCH, avg_runs: 3, level: 1 })
    expect(inputs![1].runs).toHaveLength(1)
    expect(inputs![2].runs).toHaveLength(2)
    expect(inputs![2].ledger).toEqual([])
    // Runs start 6 weeks (plus a day for zones) before the earliest open week: launch for runner 2.
    expect(runsChain.gte).toHaveBeenCalledWith('start_date', '2026-08-23T00:00:00Z')
  })

  it('pages past the 1,000-row cap', async () => {
    const many = Array.from({ length: 500 }, (_, i) => run(1, '2026-10-13'))
    const runPages = [page(many), page(many), page(many.slice(0, 20))]
    tables({ rhythm_weeks: [page([])], activities: runPages })
    const inputs = await loadRhythmInputs([1], LAUNCH, new Date('2026-10-15T05:00:00Z'))
    expect(inputs![1].runs).toHaveLength(1020)
  })

  it('treats a missing table as Rhythm being off', async () => {
    tables({ rhythm_weeks: [createQueryChain({ data: null, error: { code: 'PGRST205' } })] })
    expect(await loadRhythmInputs([1], LAUNCH)).toBeNull()
  })

  it('treats a missing Postgres relation as off too, but rethrows any other read error', async () => {
    tables({ rhythm_weeks: [createQueryChain({ data: null, error: { code: '42P01' } })] })
    expect(await loadRhythmInputs([1], LAUNCH)).toBeNull()

    tables({ rhythm_weeks: [createQueryChain({ data: null, error: { code: '57014' } })] })
    await expect(loadRhythmInputs([1], LAUNCH)).rejects.toEqual({ code: '57014' })
  })

  it('short-circuits an empty id list without touching the database', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    expect(await loadRhythmInputs([], LAUNCH)).toEqual({})
    expect(await freezeRhythmWeeks([])).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('restarts a stalled runner from their latest frozen row, warns on stale rules, and surfaces its read error', async () => {
    // 30+ weeks after launch the windowed read is empty for a runner whose freezing stalled.
    const now = new Date('2027-06-02T05:00:00Z')
    const latest = createQueryChain({ data: [
      { athlete_id: 1, week_start: '2026-10-19', runs: 2, avg_runs: '2.50', target: 3, state: 'short', level: 1, level_before_miss: 2, redeemed: false, streak: 0, rules_version: 0 },
    ], error: null })
    const runsChain = page([])
    tables({ rhythm_weeks: [page([]), latest], activities: [runsChain] })

    const inputs = await loadRhythmInputs([1], LAUNCH, now)

    expect(latest.eq).toHaveBeenCalledWith('athlete_id', 1)
    expect(latest.order).toHaveBeenCalledWith('week_start', { ascending: false })
    expect(latest.limit).toHaveBeenCalledWith(1)
    expect(inputs![1].ledger).toEqual([expect.objectContaining({ week_start: '2026-10-19', avg_runs: 2.5, level_before_miss: 2 })])
    // Runs reach 6 weeks (plus a day) before the week after that row.
    expect(runsChain.gte).toHaveBeenCalledWith('start_date', '2026-09-13T00:00:00Z')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('rules v0'))

    tables({ rhythm_weeks: [page([]), createQueryChain({ data: null, error: { code: '08006' } })] })
    await expect(loadRhythmInputs([1], LAUNCH, now)).rejects.toEqual({ code: '08006' })
  })
})

describe('loadRhythmSummaries', () => {
  it('is null while RHYTHM_LAUNCH_WEEK is unset, without touching the database', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', '')
    expect(await loadRhythmSummaries([1])).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('computes each runner once live, null before launch week, and null when the table is missing', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    tables({ rhythm_weeks: [page([])], activities: [page([run(1, LAUNCH)])] })
    const live = await loadRhythmSummaries([1, 2], new Date('2026-10-07T05:00:00Z'))
    expect(live!.launchWeek).toBe(LAUNCH)
    expect(live!.byAthlete[1]).toMatchObject({ seasonWeek: 1, thisWeek: { runs: 1 } })
    expect(live!.byAthlete[2]).toMatchObject({ seasonWeek: 1, thisWeek: { runs: 0 } })

    tables({ rhythm_weeks: [page([])], activities: [page([])] })
    expect(await loadRhythmSummaries([1], new Date('2026-10-01T05:00:00Z'))).toMatchObject({ launchWeek: LAUNCH, byAthlete: { 1: null } })

    tables({ rhythm_weeks: [createQueryChain({ data: null, error: { code: 'PGRST205' } })] })
    expect(await loadRhythmSummaries([1])).toBeNull()
  })
})

describe('freezeRhythmWeeks', () => {
  it('writes each finished week once, never overwriting a frozen row', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    const runs = Array.from({ length: 8 }, (_, w) => [0, 1, 2].map(d => run(1, addDaysIso('2026-08-24', w * 7 + d)))).flat()
    const upsert = createQueryChain({ error: null })
    tables({ rhythm_weeks: [page([]), upsert], activities: [page(runs)], history_imports: [page([{ athlete_id: 1, status: 'complete' }])] })

    // Wednesday of the week after launch: launch week is past its 2-day grace.
    const written = await freezeRhythmWeeks([1], new Date('2026-10-14T05:00:00Z'))

    expect(written).toBe(1)
    const [rows, options] = upsert.upsert.mock.calls[0]
    expect(options).toEqual({ onConflict: 'athlete_id,week_start', ignoreDuplicates: true })
    expect(rows).toEqual([expect.objectContaining({ athlete_id: 1, week_start: LAUNCH, target: 3, runs: 3, state: 'on', level: 1 })])
  })

  it('waits for a runner\'s Strava history import to finish before freezing', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    const upsert = createQueryChain({ error: null })
    tables({
      rhythm_weeks: [page([]), upsert],
      activities: [page([])],
      // Runner 1 is mid-import, runner 2 is done, runner 3 predates the importer.
      history_imports: [page([{ athlete_id: 1, status: 'queued' }, { athlete_id: 2, status: 'complete' }])],
    })
    const written = await freezeRhythmWeeks([1, 2, 3], new Date('2026-10-14T05:00:00Z'))
    expect(written).toBe(2)
    expect(upsert.upsert.mock.calls[0][0].map((r: any) => r.athlete_id)).toEqual([2, 3])
  })

  it('does nothing while Rhythm is off', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', '')
    expect(await freezeRhythmWeeks([1])).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('throws when the upsert fails so the cron can report the batch', async () => {
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    tables({ rhythm_weeks: [page([]), createQueryChain({ error: { code: '23514' } })], activities: [page([])], history_imports: [page([])] })
    await expect(freezeRhythmWeeks([1], new Date('2026-10-14T05:00:00Z'))).rejects.toEqual({ code: '23514' })
  })
})

describe('GET /api/cron/rhythm-freeze', () => {
  const request = (auth?: string) => new NextRequest('http://localhost/api/cron/rhythm-freeze', { headers: auth ? { authorization: auth } : {} })

  it('rejects callers without the cron secret', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    expect((await freezeCron(request())).status).toBe(401)
    expect((await freezeCron(request('Bearer nope'))).status).toBe(401)
  })

  it('rejects every caller when CRON_SECRET is unset, including "Bearer undefined"', async () => {
    vi.stubEnv('CRON_SECRET', '')
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    expect((await freezeCron(request('Bearer undefined'))).status).toBe(401)
    expect((await freezeCron(request('Bearer '))).status).toBe(401)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('keeps going past a failed batch and reports its athletes', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T05:00:00Z')) // launch week is past its grace
    try {
      const tokens = Array.from({ length: 60 }, (_, i) => ({ athlete_id: i + 1 }))
      const upsert = createQueryChain({ error: null })
      tables({
        strava_tokens: [page(tokens)],
        rhythm_weeks: [createQueryChain({ data: null, error: { code: '57014' } }), page([]), upsert],
        activities: [page([])],
        history_imports: [page([])],
      })
      const body = await (await freezeCron(request('Bearer secret'))).json()
      expect(body).toMatchObject({ ok: false, athletes: 60, frozen: 10 })
      expect(body.failed).toEqual(tokens.slice(0, 50).map(t => t.athlete_id))
      expect(upsert.upsert.mock.calls[0][0]).toHaveLength(10)
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips while Rhythm is off', async () => {
    vi.stubEnv('CRON_SECRET', 'secret')
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', '')
    const response = await freezeCron(request('Bearer secret'))
    expect(await response.json()).toEqual({ ok: true, skipped: 'rhythm off' })
  })

  it('freezes every connected athlete, not just the next sync batch', async () => {
    // Pinned after launch week's grace period, so every athlete has a week to freeze.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-14T05:00:00Z'))
    vi.stubEnv('CRON_SECRET', 'secret')
    vi.stubEnv('RHYTHM_LAUNCH_WEEK', LAUNCH)
    const tokens = Array.from({ length: 60 }, (_, i) => ({ athlete_id: i + 1 }))
    const upserts = [createQueryChain({ error: null }), createQueryChain({ error: null })]
    tables({
      strava_tokens: [page(tokens)],
      rhythm_weeks: [page([]), upserts[0], page([]), upserts[1]],
      activities: [page([]), page([])],
      history_imports: [page([]), page([])],
    })
    const response = await freezeCron(request('Bearer secret'))
    expect(await response.json()).toMatchObject({ ok: true, athletes: 60, frozen: 60, failed: [] })
    expect(upserts[0].upsert.mock.calls[0][0]).toHaveLength(50)
    expect(upserts[1].upsert.mock.calls[0][0]).toHaveLength(10)
    vi.useRealTimers()
  })
})

function addDaysIso(date: string, n: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
}
