import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

// The app's tsconfig preserves JSX for Next; under vitest it compiles to React.createElement.
;(globalThis as any).React = React

vi.mock('@/lib/auth', () => ({ getAthleteId: vi.fn() }))
vi.mock('@/lib/groupAccess', () => ({ groupRole: vi.fn() }))
vi.mock('@/lib/raidData', () => ({ loadRaidState: vi.fn() }))

import { NextRequest } from 'next/server'
import { getAthleteId } from '@/lib/auth'
import { groupRole } from '@/lib/groupAccess'
import { loadRaidState, type RaidView } from '@/lib/raidData'
import { addDays } from '@/lib/calendar'
import { foldTimeline, type RhythmRun } from '@/lib/rhythm'
import { computeRaid } from '@/lib/raid'
import { situation } from '@/lib/raidCopy'
import { drawableImageType, fetchAvatars } from '@/lib/raidCard'
import { GET as cardRoute } from '@/app/api/groups/[id]/raid/card/route'

const GROUP = 'group-1'
const LAUNCH = '2026-10-05'
const PRE = addDays(LAUNCH, -42)
const run = (day: string): RhythmRun => ({ start_date: `${addDays(day, -1)}T23:00:00Z`, start_date_local: `${day}T06:00:00`, moving_time: 2400 })

/** A group in hype week, before its first raid. */
function hypeWeekView(): RaidView {
  const now = new Date('2026-10-07T05:00:00Z')
  const timeline = foldTimeline({ zone: 'Asia/Jakarta', ledger: [], runs: Array.from({ length: 21 }, (_, i) => run(addDays(PRE, Math.floor(i / 3) * 7 + (i % 3)))) }, LAUNCH, now)!
  const state = computeRaid({
    members: [{ athlete_id: 1, name: 'Budi Santoso', joinedDay: '2026-01-01', history: timeline.history, current: timeline.current, frozenThrough: null }],
    groupZone: 'Asia/Jakarta',
    createdDay: '2026-03-01',
    rhythmLaunchWeek: LAUNCH,
    now,
  })
  return { groupId: GROUP, groupName: 'Jakarta Pacers', zone: 'Asia/Jakarta', state, members: { 1: { name: 'Budi Santoso', pic: null } }, summary: situation(state), report: null }
}

const req = (kind?: string) => new NextRequest(`http://localhost/api/groups/${GROUP}/raid/card${kind ? `?kind=${kind}` : ''}`)
const call = (kind?: string) => cardRoute(req(kind), { params: { id: GROUP } })

beforeEach(() => {
  vi.mocked(getAthleteId).mockResolvedValue('1')
  vi.mocked(groupRole).mockResolvedValue('member')
})
afterEach(() => { vi.clearAllMocks() })

describe('GET /api/groups/[id]/raid/card', () => {
  it('needs a signed-in member and a known kind', async () => {
    vi.mocked(getAthleteId).mockResolvedValueOnce(undefined)
    expect((await call('report')).status).toBe(401)
    expect((await call('bogus')).status).toBe(400)
    expect((await call()).status).toBe(400)
    vi.mocked(groupRole).mockResolvedValueOnce(undefined)
    expect((await call('rally')).status).toBe(403)
    expect(loadRaidState).not.toHaveBeenCalled()
  })

  it('404s while the raid is off', async () => {
    vi.mocked(loadRaidState).mockResolvedValueOnce(null)
    expect((await call('rally')).status).toBe(404)
  })

  it('renders the pre-first-raid countdown as a PNG, with initials for a missing avatar', async () => {
    vi.mocked(loadRaidState).mockResolvedValueOnce(hypeWeekView())
    const res = await call('report')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const png = new Uint8Array(await res.arrayBuffer())
    expect(drawableImageType(png)).toBe('image/png')
  }, 20000)
})

describe('fetchAvatars', () => {
  it('falls back to initials (null) when the budget runs out', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const started = Date.now()
    expect(await fetchAvatars({ 1: 'https://example.com/a.jpg' }, 50)).toEqual({ 1: null })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('skips non-https pictures without fetching them', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    expect(await fetchAvatars({ 1: 'avatar/athlete/large.png', 2: null })).toEqual({ 1: null, 2: null })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('drawableImageType', () => {
  const jpeg = (sof: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, sof, 0x00, 0x04, 0x00, 0x00])

  it('accepts PNG and baseline JPEG', () => {
    expect(drawableImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png')
    expect(drawableImageType(jpeg(0xc0))).toBe('image/jpeg')
  })

  it('rejects progressive JPEG and anything else, which would crash the render', () => {
    expect(drawableImageType(jpeg(0xc2))).toBeNull()
    expect(drawableImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull() // WebP
  })
})
