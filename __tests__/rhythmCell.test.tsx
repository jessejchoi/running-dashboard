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
    weapon: { tier: tier('stick'), level: 1, nextTier: tier('dagger'), weeksToNext: 1, tierWeeksDone: 0, tierWeeksTotal: 1, leveledUp: false, redeemAvailable: false, redeemTier: null },
    history: [{ week: '2026-10-05', state: 'on', runs: 3, target: 3 }],
    unfrozenWeeks: 0,
    ...overrides,
  }
}

const html = (r: RhythmResult) => renderToStaticMarkup(<RhythmCell rhythm={r} />)

describe('RhythmCell', () => {
  const bars = (markup: string, color: string) => markup.split(`background:${color}`).length - 1

  it('shows level, attack power and streak as numbers', () => {
    const markup = html(result({ streak: 5, weapon: { ...result().weapon, tier: tier('sword'), level: 5, nextTier: tier('axe'), weeksToNext: 2, tierWeeksDone: 1, tierWeeksTotal: 3 } }))
    expect(markup).toContain('Your level')
    expect(markup).toMatch(/Level<\/p><div[^>]*>4<\/div><p[^>]*>Sword/)
    expect(markup).toMatch(/Attack<\/p><div[^>]*>3<\/div>/)
    // The streak sits inside a flame, like Strava's streak badge.
    expect(markup).toContain('aria-label="5-week streak"')
    expect(markup).toMatch(/Streak<\/p><p[^>]*>weeks<\/p>/)
    expect(markup).not.toContain('Season')
  })

  it('lights the streak flame once there is a streak, and greys it out at 0', () => {
    const lit = html(result({ streak: 12 }))
    expect(lit).toContain('aria-label="12-week streak"')
    expect(lit).toContain('fill="var(--accent)"')
    const cold = html(result({ streak: 0 }))
    expect(cold).toContain('aria-label="0-week streak"')
    expect(cold).toContain('fill="var(--surface-3)"')
    expect(html(result({ streak: 1 }))).toMatch(/Streak<\/p><p[^>]*>week<\/p>/)
  })

  it('draws one bar per target run, orange as they happen, and all green once the target is hit', () => {
    const inProgress = html(result())
    expect(inProgress).toContain('1 of 3 target runs this week')
    expect(inProgress).toContain('2 to go')
    expect(bars(inProgress, 'var(--success)')).toBe(0)

    const hit = html(result({ status: 'on', thisWeek: { runs: 5, needed: 0, daysLeft: 2, runDays: [WEEK] } }))
    expect(hit).toMatch(/<b[^>]*>5<\/b> done · target <b[^>]*>3<\/b> runs ✓/)
    // Exactly the 3 target bars, all green: extra runs don't add bars.
    expect(bars(hit, 'var(--success)')).toBe(3)
  })

  it('says LEVEL UP! only in the week the weapon changed tier', () => {
    expect(html(result({ status: 'on', weapon: { ...result().weapon, leveledUp: true } }))).toContain('Level up!')
    expect(html(result())).not.toContain('Level up!')
  })

  it('shows progress to the next level as week pips with the next weapon', () => {
    const markup = html(result({ weapon: { ...result().weapon, tier: tier('dagger'), level: 3, nextTier: tier('sword'), weeksToNext: 1, tierWeeksDone: 1, tierWeeksTotal: 2 } }))
    expect(markup).toContain('1 of 2 weeks on target toward level 4')
    expect(markup).toContain('1/2 wks')
    expect(markup).toContain('aria-label="Sword"')
    expect(markup).toMatch(/Lv <!-- -->4|Lv 4/)
  })

  it('adds a note only when the week needs attention, and shows Max level at Legendary', () => {
    expect(html(result({ status: 'at_risk', thisWeek: { runs: 0, needed: 1, daysLeft: 1, runDays: [] } }))).toContain('At risk: 1 run in 1 day')
    expect(html(result({ status: 'redeem', weapon: { ...result().weapon, redeemAvailable: true, redeemTier: tier('sword') } }))).toContain('win back your Sword')
    expect(html(result({ status: 'redeem' }))).toContain('win back your weapon')
    expect(html(result({ status: 'fade' }))).toContain('Fading: missed 2 of your last 3 weeks')
    expect(html(result({ status: 'building' }))).not.toMatch(/At risk|Fading|win back/)
    const max = html(result({ weapon: { ...result().weapon, tier: tier('legendary'), level: 12, nextTier: null, weeksToNext: null, tierWeeksDone: 0, tierWeeksTotal: 0 } }))
    expect(max).toContain('Max level reached')
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
    expect(markup).toContain('1 of 3 target runs this week')

    mockFreeze.mockClear()
    mockLoad.mockResolvedValue({ launchWeek: '2026-10-05', byAthlete: { 1: result({ unfrozenWeeks: 0 }) } })
    await DashboardRhythmSection({ athleteId: 1, today: TODAY })
    expect(mockFreeze).not.toHaveBeenCalled()
  })
})
