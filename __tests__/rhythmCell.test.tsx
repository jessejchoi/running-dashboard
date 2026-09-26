import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The app's tsconfig preserves JSX for Next; under vitest it compiles to React.createElement.
;(globalThis as any).React = React

vi.mock('@/lib/rhythmData', () => ({ loadRhythmSummaries: vi.fn() }))
vi.mock('@/lib/rhythmLedger', () => ({ freezeLoadedWeeks: vi.fn() }))

import { loadRhythmSummaries } from '@/lib/rhythmData'
import { freezeLoadedWeeks } from '@/lib/rhythmLedger'
import { TIERS, type RhythmResult, type RhythmStatus } from '@/lib/rhythm'
import RhythmCell from '@/components/RhythmCell'
import DashboardRhythmSection from '@/components/DashboardRhythmSection'

const WEEK = '2026-10-12' // a Monday
const TODAY = '2026-10-14'
const tier = (key: string) => TIERS.find(t => t.key === key)!

function result(overrides: Partial<RhythmResult> = {}): RhythmResult {
  return {
    launchWeek: '2026-10-05',
    seasonWeek: 2,
    week: WEEK,
    target: 3,
    avgRuns: 3,
    thisWeek: { runs: 1, needed: 2, daysLeft: 5, runDays: [WEEK] },
    status: 'building',
    streak: 1,
    fadeWeeks: 0,
    weapon: { tier: tier('stick'), level: 1, nextTier: tier('dagger'), weeksToNext: 1, redeemAvailable: false, redeemTier: null },
    history: [{ week: '2026-10-05', state: 'on', runs: 3, target: 3 }],
    unfrozenWeeks: 0,
    ...overrides,
  }
}

const html = (r: RhythmResult) => renderToStaticMarkup(<RhythmCell rhythm={r} today={TODAY} />)

describe('RhythmCell', () => {
  it('shows the label and next step for every status', () => {
    const cases: Array<[RhythmStatus, Partial<RhythmResult>, string, string]> = [
      ['on', { thisWeek: { runs: 3, needed: 0, daysLeft: 4, runDays: [WEEK] } }, 'Target hit', 'Done for the week'],
      ['building', {}, 'On pace', '2 runs to go · 5 days left'],
      ['at_risk', { thisWeek: { runs: 0, needed: 3, daysLeft: 2, runDays: [] } }, 'At risk', 'Need 3 runs in 2 days'],
      ['fade', {}, 'Fading', 'Missed 2 of your last 3 weeks · 2 runs to go'],
      ['redeem', { weapon: { ...result().weapon, redeemAvailable: true, redeemTier: tier('sword') } }, 'Redeem', 'Hit 3 this week to get your Sword back'],
    ]
    for (const [status, overrides, label, line] of cases) {
      const markup = html(result({ status, ...overrides }))
      expect(markup, status).toContain(label)
      expect(markup, status).toContain(line)
    }
  })

  it('uses singulars, shows Max tier at Legendary, and hides an empty history strip', () => {
    const markup = html(result({
      status: 'at_risk',
      thisWeek: { runs: 2, needed: 1, daysLeft: 1, runDays: [WEEK] },
      weapon: { tier: tier('legendary'), level: 12, nextTier: null, weeksToNext: null, redeemAvailable: false, redeemTier: null },
      history: [],
    }))
    expect(markup).toContain('Need 1 run in 1 day')
    expect(markup).toContain('Max tier')
    expect(markup).toContain('aria-label="Legendary"')
    expect(markup).not.toContain('Recent weeks')
    // A redeem with no known tier still reads sensibly.
    expect(html(result({ status: 'redeem' }))).toContain('get your weapon back')
  })
})

describe('DashboardRhythmSection', () => {
  const mockLoad = loadRhythmSummaries as ReturnType<typeof vi.fn>
  const mockFreeze = freezeLoadedWeeks as ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders nothing while Rhythm is off or failing, and a launch notice before launch week', async () => {
    mockLoad.mockResolvedValueOnce(null)
    expect(await DashboardRhythmSection({ athleteId: 1, today: TODAY })).toBeNull()

    mockLoad.mockRejectedValueOnce(new Error('db down'))
    expect(await DashboardRhythmSection({ athleteId: 1, today: TODAY })).toBeNull()

    mockLoad.mockResolvedValueOnce({ launchWeek: '2026-10-05', byAthlete: { 1: null } })
    const notice = renderToStaticMarkup((await DashboardRhythmSection({ athleteId: 1, today: '2026-10-01' }))!)
    expect(notice).toContain('Starts Mon, Oct 5')
    expect(notice).toContain('Everyone begins Unarmed')
    expect(mockFreeze).not.toHaveBeenCalled()
  })

  it('catches up an unfrozen ledger without failing the card when the freeze errors', async () => {
    const inputs = { 1: { zone: 'Asia/Jakarta', ledger: [], runs: [] } }
    const now = new Date('2026-10-14T05:00:00Z')
    mockLoad.mockResolvedValue({ launchWeek: '2026-10-05', now, inputs, byAthlete: { 1: result({ unfrozenWeeks: 2 }) } })
    mockFreeze.mockRejectedValueOnce(new Error('upsert failed'))
    const markup = renderToStaticMarkup((await DashboardRhythmSection({ athleteId: 1, today: TODAY }))!)
    // The freeze reuses what the card already loaded rather than querying again.
    expect(mockFreeze).toHaveBeenCalledWith(inputs, '2026-10-05', now)
    expect(markup).toContain('1/3')

    mockFreeze.mockClear()
    mockLoad.mockResolvedValue({ launchWeek: '2026-10-05', byAthlete: { 1: result({ unfrozenWeeks: 0 }) } })
    await DashboardRhythmSection({ athleteId: 1, today: TODAY })
    expect(mockFreeze).not.toHaveBeenCalled()
  })
})
