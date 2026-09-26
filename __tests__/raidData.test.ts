import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/rhythmData', () => ({ rhythmLaunchWeek: vi.fn(), loadRhythmInputs: vi.fn() }))
vi.mock('@/lib/rhythmLedger', () => ({ freezeLoadedWeeks: vi.fn(async () => 0) }))
vi.mock('@/lib/auth', () => ({ getAthleteId: vi.fn() }))
vi.mock('@/lib/groupAccess', () => ({ groupRole: vi.fn() }))

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadRhythmInputs, rhythmLaunchWeek } from '@/lib/rhythmData'
import { freezeLoadedWeeks } from '@/lib/rhythmLedger'
import { getAthleteId } from '@/lib/auth'
import { groupRole } from '@/lib/groupAccess'
import { createQueryChain } from '@/__tests__/helpers/supabase'
import { addDays } from '@/lib/calendar'
import { foldTimeline, type LedgerRow, type RhythmInputs, type RhythmRun } from '@/lib/rhythm'
import { loadRaidState } from '@/lib/raidData'
import { GET as raidRoute } from '@/app/api/groups/[id]/raid/route'

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>
const LAUNCH = '2026-10-05'
const RAID = '2026-10-12'
const PRE = addDays(LAUNCH, -6 * 7)
const ZONE = 'Asia/Jakarta'
const GROUP = 'group-1'

const run = (day: string): RhythmRun => ({ start_date: `${addDays(day, -1)}T23:00:00Z`, start_date_local: `${day}T06:00:00`, moving_time: 2400 })
const runs = (counts: number[]) => counts.flatMap((n, i) => Array.from({ length: n }, (_, d) => run(addDays(PRE, i * 7 + d))))

function tables(queues: Record<string, Array<ReturnType<typeof createQueryChain>>>) {
  mockFrom.mockImplementation((table: string) => {
    const next = queues[table]?.shift()
    if (!next) throw new Error(`unexpected query on ${table}`)
    return next
  })
}
const result = (data: unknown) => createQueryChain({ data, error: null })

function setup(inputs: Record<number, RhythmInputs>, pics: Record<number, string | null> = {}) {
  const ids = Object.keys(inputs).map(Number)
  tables({
    groups: [result({ id: GROUP, name: 'Jakarta Pacers', created_at: '2026-03-13T00:00:00Z' })],
    group_members: [result(ids.map(id => ({ athlete_id: id, joined_at: '2026-03-13T00:00:00Z' })))],
    strava_tokens: [result(ids.map(id => ({ athlete_id: id, athlete_name: `Runner ${id}`, athlete_profile: pics[id] ?? null })))],
  })
  vi.mocked(loadRhythmInputs).mockResolvedValue(inputs)
}

/** Launch week as a frozen ledger row, taken from the live fold. */
function frozenLaunchRow(counts: number[], now: Date): LedgerRow {
  return foldTimeline({ zone: ZONE, ledger: [], runs: runs(counts) }, LAUNCH, now)!.history[0]
}

beforeEach(() => {
  mockFrom.mockReset()
  vi.mocked(rhythmLaunchWeek).mockReturnValue(LAUNCH)
  vi.mocked(freezeLoadedWeeks).mockClear()
})
afterEach(() => { vi.restoreAllMocks() })

describe('loadRaidState', () => {
  it('is off while Rhythm is off', async () => {
    vi.mocked(rhythmLaunchWeek).mockReturnValue(null)
    expect(await loadRaidState(GROUP)).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('marks HP provisional until the week before the raid is frozen', async () => {
    const counts = [3, 3, 3, 3, 3, 3, 3, 2]
    const tuesday = new Date(`${addDays(RAID, 1)}T05:00:00Z`)
    setup({ 1: { zone: ZONE, ledger: [], runs: runs(counts) }, 2: { zone: ZONE, ledger: [], runs: runs(counts) } })
    const live = (await loadRaidState(GROUP, tuesday))!
    expect(live.state.raid?.hpProvisional).toBe(true)

    const wednesday = new Date(`${addDays(RAID, 2)}T05:00:00Z`)
    const row = frozenLaunchRow(counts, wednesday)
    setup({
      1: { zone: ZONE, ledger: [row], runs: runs(counts) },
      2: { zone: ZONE, ledger: [row], runs: runs(counts) },
    })
    const frozen = (await loadRaidState(GROUP, wednesday))!
    expect(frozen.state.raid?.hpProvisional).toBe(false)
    // The frozen row and the live fold agree, so HP doesn't move when the week freezes.
    expect(frozen.state.raid?.hp).toBe(live.state.raid?.hp)
  })

  it('loads a year of ledger rows, catches up the freeze, and names the view', async () => {
    const now = new Date(`${addDays(RAID, 2)}T05:00:00Z`)
    const inputs = { 1: { zone: ZONE, ledger: [], runs: runs([3, 3, 3, 3, 3, 3, 3, 3]) } }
    setup(inputs, { 1: 'avatar/athlete/large.png' })
    const view = (await loadRaidState(GROUP, now))!
    expect(vi.mocked(loadRhythmInputs).mock.calls[0][3]).toEqual({ ledgerWeeks: 62 })
    expect(freezeLoadedWeeks).toHaveBeenCalledWith(inputs, LAUNCH, now)
    expect(view.groupName).toBe('Jakarta Pacers')
    expect(view.zone).toBe(ZONE)
    // Strava's relative placeholder isn't a usable image.
    expect(view.members[1]).toEqual({ name: 'Runner 1', pic: null })
    expect(view.summary).toMatch(/Humidity Golem/)
  })

  it('still answers when the catch-up freeze fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(freezeLoadedWeeks).mockRejectedValueOnce(new Error('db down'))
    setup({ 1: { zone: ZONE, ledger: [], runs: runs([3, 3, 3, 3, 3, 3, 3]) } })
    expect(await loadRaidState(GROUP, new Date(`${RAID}T05:00:00Z`))).not.toBeNull()
  })

  it('builds last week\'s report with its shame list', async () => {
    const now = new Date(`${addDays(RAID, 8)}T05:00:00Z`) // Tuesday of raid week 2
    setup({
      1: { zone: ZONE, ledger: [], runs: runs([3, 3, 3, 3, 3, 3, 3, 3, 3]) },
      2: { zone: ZONE, ledger: [], runs: runs([3, 3, 3, 3, 3, 3, 3, 3, 3]) },
      3: { zone: ZONE, ledger: [], runs: runs([3, 3, 3, 3, 3, 3, 3, 0, 3]) },
    })
    const view = (await loadRaidState(GROUP, now))!
    expect(view.report?.raidWeek).toBe(1)
    expect(view.report?.week.landed).toBe(true)
    expect(view.report?.shame.entries.map(e => e.name)).toEqual(['Runner 3'])
    expect(view.report?.week.provisional).toBe(true)
  })
})

describe('GET /api/groups/[id]/raid', () => {
  const req = () => new NextRequest(`http://localhost/api/groups/${GROUP}/raid`)

  it('needs a signed-in member', async () => {
    vi.mocked(getAthleteId).mockResolvedValueOnce(undefined)
    expect((await raidRoute(req(), { params: { id: GROUP } })).status).toBe(401)
    vi.mocked(getAthleteId).mockResolvedValueOnce('7')
    vi.mocked(groupRole).mockResolvedValueOnce(undefined)
    expect((await raidRoute(req(), { params: { id: GROUP } })).status).toBe(403)
  })

  it('says when the raid is off', async () => {
    vi.mocked(getAthleteId).mockResolvedValueOnce('1')
    vi.mocked(groupRole).mockResolvedValueOnce('member')
    vi.mocked(rhythmLaunchWeek).mockReturnValue(null)
    expect(await (await raidRoute(req(), { params: { id: GROUP } })).json()).toEqual({ enabled: false })
  })

  it('returns the view', async () => {
    vi.mocked(getAthleteId).mockResolvedValueOnce('1')
    vi.mocked(groupRole).mockResolvedValueOnce('member')
    setup({ 1: { zone: ZONE, ledger: [], runs: runs([3, 3, 3, 3, 3, 3, 3]) } })
    const body = await (await raidRoute(req(), { params: { id: GROUP } })).json()
    expect(body.enabled).toBe(true)
    expect(body.view.groupId).toBe(GROUP)
  })
})
