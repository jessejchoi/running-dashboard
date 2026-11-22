import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/rhythmData', () => ({ rhythmLaunchWeek: vi.fn(), loadRhythmInputs: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAthleteId: vi.fn() }))
vi.mock('@/lib/groupAccess', () => ({ groupRole: vi.fn() }))

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadRhythmInputs, rhythmLaunchWeek } from '@/lib/rhythmData'
import { getAthleteId } from '@/lib/auth'
import { groupRole } from '@/lib/groupAccess'
import { createQueryChain } from '@/__tests__/helpers/supabase'
import { addDays } from '@/lib/calendar'
import { weekCounts, type RhythmInputs, type RhythmRun } from '@/lib/rhythm'
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
const input = (counts: number[]): RhythmInputs => ({ zone: ZONE, weeks: weekCounts(runs(counts), ZONE), runs: runs(counts) })

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

beforeEach(() => {
  mockFrom.mockReset()
  vi.mocked(rhythmLaunchWeek).mockReturnValue(LAUNCH)
})
afterEach(() => { vi.restoreAllMocks() })

describe('loadRaidState', () => {
  it('is off while Rhythm is off', async () => {
    vi.mocked(rhythmLaunchWeek).mockReturnValue(null)
    expect(await loadRaidState(GROUP)).toBeNull()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('fixes HP before the raid: the same before and after the week before it settles', async () => {
    const counts = [3, 3, 3, 3, 3, 3, 3, 2]
    setup({ 1: input(counts), 2: input(counts) })
    const live = (await loadRaidState(GROUP, new Date(`${addDays(RAID, 1)}T05:00:00Z`)))!
    // The first raid's HP rests on nothing but launch (everyone starts Unarmed), so it's settled.
    expect(live.state.raid?.hpProvisional).toBe(false)

    setup({ 1: input(counts), 2: input(counts) })
    const settled = (await loadRaidState(GROUP, new Date(`${addDays(RAID, 2)}T05:00:00Z`)))!
    expect(settled.state.raid?.hp).toBe(live.state.raid?.hp)
  })

  it('treats a week as settled once its grace period passes, and names the view', async () => {
    const now = new Date(`${addDays(RAID, 2)}T05:00:00Z`) // Wednesday: launch week has settled
    setup({ 1: input([3, 3, 3, 3, 3, 3, 3, 3]) }, { 1: 'avatar/athlete/large.png' })
    const view = (await loadRaidState(GROUP, now))!
    expect(vi.mocked(loadRhythmInputs)).toHaveBeenCalledWith([1], LAUNCH, now)
    expect(mockFrom).not.toHaveBeenCalledWith('rhythm_weeks')
    expect(view.groupName).toBe('Jakarta Pacers')
    expect(view.zone).toBe(ZONE)
    // Strava's relative placeholder isn't a usable image.
    expect(view.members[1]).toEqual({ name: 'Runner 1', pic: null })
    expect(view.summary).toMatch(/Humidity Golem/)
  })

  it('builds last week\'s report with its shame list', async () => {
    const now = new Date(`${addDays(RAID, 8)}T05:00:00Z`) // Tuesday of raid week 2
    setup({
      1: input([3, 3, 3, 3, 3, 3, 3, 3, 3]),
      2: input([3, 3, 3, 3, 3, 3, 3, 3, 3]),
      3: input([3, 3, 3, 3, 3, 3, 3, 0, 3]),
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
    setup({ 1: input([3, 3, 3, 3, 3, 3, 3]) })
    const body = await (await raidRoute(req(), { params: { id: GROUP } })).json()
    expect(body.enabled).toBe(true)
    expect(body.view.groupId).toBe(GROUP)
  })

  const future = () => new NextRequest(`http://localhost/api/groups/${GROUP}/raid?at=2026-12-22`)

  it('previews a future day in local development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.mocked(getAthleteId).mockResolvedValueOnce('1')
    vi.mocked(groupRole).mockResolvedValueOnce('member')
    setup({ 1: input([3, 3, 3, 3, 3, 3, 3]) })
    const body = await (await raidRoute(future(), { params: { id: GROUP } })).json()
    expect(body.view.state.week).toBe('2026-12-21')
    vi.unstubAllEnvs()
  })

  it('ignores ?at= outside local development', async () => {
    vi.mocked(getAthleteId).mockResolvedValueOnce('1')
    vi.mocked(groupRole).mockResolvedValueOnce('member')
    setup({ 1: input([3, 3, 3, 3, 3, 3, 3]) })
    const body = await (await raidRoute(future(), { params: { id: GROUP } })).json()
    expect(body.view.state.week).not.toBe('2026-12-21')
  })
})
