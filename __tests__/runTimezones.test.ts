import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }))
import { format } from 'date-fns'
import { commonTimezone, latestRunTimezone, runDay, runWallTime } from '@/lib/calendar'
import { computeStreak } from '@/lib/utils'
import { buildChallengeMetricsFromActivities, buildCoachTotals } from '@/lib/coachMetrics'

// 9pm Sunday Sep 6 in Los Angeles is 04:00 Monday Sep 7 UTC (11am Sep 7 in Jakarta).
const laSundayNight = { start_date: '2026-09-07T04:00:00Z', start_date_local: '2026-09-06T21:00:00Z' }

describe('runDay', () => {
  it('uses the local date where the run happened', () => {
    expect(runDay(laSundayNight)).toBe('2026-09-06')
  })

  it('reads the Strava payload when the column is not selected', () => {
    expect(runDay({ start_date: laSundayNight.start_date, raw: { start_date_local: laSundayNight.start_date_local } })).toBe('2026-09-06')
  })

  it('falls back to the given zone without local data', () => {
    expect(runDay({ start_date: '2026-09-07T04:00:00Z' }, 'America/Los_Angeles')).toBe('2026-09-06')
    expect(runDay({ start_date: '2026-09-07T04:00:00Z' }, 'Asia/Jakarta')).toBe('2026-09-07')
  })
})

describe('runWallTime', () => {
  it('prints the time on the runner\'s watch', () => {
    expect(format(runWallTime(laSundayNight), 'EEE MMM d, h:mm a')).toBe('Sun Sep 6, 9:00 PM')
  })

  it('falls back to the given zone without local data', () => {
    expect(format(runWallTime({ start_date: '2026-09-25T23:03:06Z' }, 'Asia/Jakarta'), 'MMM d h:mm a')).toBe('Sep 26 6:03 AM')
  })
})

describe('zone pickers', () => {
  it('takes the most common member zone', () => {
    expect(commonTimezone(['America/Los_Angeles', 'Asia/Jakarta', 'America/Los_Angeles', null])).toBe('America/Los_Angeles')
    expect(commonTimezone([])).toBe('Asia/Jakarta')
  })

  it('takes the zone of the latest run that has one', () => {
    expect(latestRunTimezone([
      { start_date: '2026-09-01T00:00:00Z', timezone: 'Asia/Jakarta' },
      { start_date: '2026-09-05T00:00:00Z', timezone: 'America/Los_Angeles' },
      { start_date: '2026-09-06T00:00:00Z', timezone: null },
    ])).toBe('America/Los_Angeles')
  })
})

describe('local weeks', () => {
  it('counts a Sunday-night run in the week it was run', () => {
    // Sep 7 is a Monday. In UTC or Jakarta this run would open the new week.
    const runs = [{ ...laSundayNight, athlete_id: 1 }]
    expect(computeStreak(runs, 1, '2026-09-13')).toBe(1)
    expect(computeStreak(runs, 1, '2026-09-20')).toBe(0)
  })

  it('totals the viewer\'s week on each run\'s local date', () => {
    const now = new Date('2026-09-07T05:00:00Z') // Sun Sep 6, 10pm in Los Angeles
    const totals = buildCoachTotals([{ ...laSundayNight, athlete_id: 1, type: 'Run', distance: 10000 }], now, 'America/Los_Angeles')
    expect(totals.week.range_start).toBe('2026-08-31')
    expect(totals.week.km).toBe(10)
  })

  it('counts a challenge run on the local day it happened', () => {
    const [metrics] = buildChallengeMetricsFromActivities({
      challenges: [{ name: 'Week one', challenge_type: 'group_distance', target_meters: 20000, start_date: '2026-08-31', end_date: '2026-09-06' }],
      activities: [{ ...laSundayNight, athlete_id: 1, type: 'Run', distance: 10000 }],
      now: new Date('2026-09-07T05:00:00Z'),
      timezone: 'America/Los_Angeles',
    })
    expect(metrics.total_km).toBe(10)
  })
})
