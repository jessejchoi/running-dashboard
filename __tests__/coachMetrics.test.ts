import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

import {
  buildChallengeMetricsFromActivities,
  buildCoachTotals,
  buildGroupSignals,
  getCoachRangeDefinitions,
  type CoachActivity,
} from '@/lib/coachMetrics'

const NOW = new Date('2026-05-13T18:00:00Z') // Thu May 14 in Jakarta

describe('coach metrics ranges', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defines ranges as local dates in the viewer\'s zone, through tomorrow', () => {
    const ranges = getCoachRangeDefinitions(NOW)

    expect(ranges.ytd.range_start).toBe('2026-01-01')
    expect(ranges.ytd.range_end).toBe('2026-05-15')
    expect(ranges.week.range_start).toBe('2026-05-11')
    expect(ranges.month.range_start).toBe('2026-05-01')
  })

  it('uses the viewer\'s own date when their zone is behind', () => {
    const ranges = getCoachRangeDefinitions(new Date('2026-05-11T03:00:00Z'), 'America/Los_Angeles')

    // Still Sunday May 10 in Los Angeles, so the week began May 4.
    expect(ranges.week.range_start).toBe('2026-05-04')
    expect(ranges.week.range_end).toBe('2026-05-11')
  })
})

describe('buildCoachTotals', () => {
  it('computes YTD across all rows and filters non-run activities', () => {
    const activities: CoachActivity[] = [
      { athlete_id: 1, start_date: '2025-12-30T10:00:00Z', distance: 50000, type: 'Run' },
      { athlete_id: 1, start_date: '2026-01-01T00:00:00Z', distance: 100000, type: 'Run' },
      { athlete_id: 2, start_date: '2026-03-01T00:00:00Z', distance: 150000, type: 'Run' },
      { athlete_id: 2, start_date: '2026-04-01T00:00:00Z', distance: 150000, type: 'Run' },
      { athlete_id: 2, start_date: '2026-05-01T00:00:00Z', distance: 999000, type: 'Ride' },
    ]

    const totals = buildCoachTotals(activities, NOW)

    expect(totals.ytd.km).toBe(400)
    expect(totals.ytd.source_count).toBe(3)
    expect(totals.all_time.km).toBe(450)
    expect(totals.all_time.source_count).toBe(4)
  })

  it('does not depend on a recent-row limit for YTD totals', () => {
    const activities = Array.from({ length: 80 }, (_, i): CoachActivity => ({
      athlete_id: i % 2 === 0 ? 1 : 2,
      start_date: `2026-02-${String((i % 20) + 1).padStart(2, '0')}T08:00:00Z`,
      distance: 5000,
      type: 'Run',
    }))

    const totals = buildCoachTotals(activities, NOW)

    expect(totals.ytd.km).toBe(400)
    expect(totals.ytd.source_count).toBe(80)
  })
})

describe('challenge metrics', () => {
  it('uses the challenge date range rather than a recent-runs slice', () => {
    const metrics = buildChallengeMetricsFromActivities({
      challenges: [{
        name: 'Spring Stack',
        challenge_type: 'group_distance',
        target_meters: 300000,
        start_date: '2026-01-01',
        end_date: '2026-03-31',
      }],
      activities: [
        { athlete_id: 1, start_date: '2026-01-10T08:00:00Z', distance: 100000, type: 'Run' },
        { athlete_id: 2, start_date: '2026-02-10T08:00:00Z', distance: 100000, type: 'Run' },
        { athlete_id: 2, start_date: '2026-03-10T08:00:00Z', distance: 100000, type: 'Run' },
        { athlete_id: 2, start_date: '2026-04-10T08:00:00Z', distance: 100000, type: 'Run' },
      ],
    })

    expect(metrics[0]).toMatchObject({
      total_km: 300,
      pct: 100,
      source_count: 3,
      progress_value: 300,
      target_value: 300,
      progress_unit: 'km',
    })
  })

  it('calculates weekly quota progress as completed member-weeks', () => {
    const metrics = buildChallengeMetricsFromActivities({
      challenges: [{
        name: 'Weekly Base',
        challenge_type: 'weekly_quota',
        target_meters: 10000,
        config: { weekly_meters: 10000 },
        start_date: '2026-05-04',
        end_date: '2026-05-31',
      }],
      memberIds: [1, 2, 3, 4],
      now: new Date('2026-05-14T12:00:00Z'),
      activities: [
        { athlete_id: 1, start_date: '2026-05-05T08:00:00Z', distance: 10000, type: 'Run' },
        { athlete_id: 2, start_date: '2026-05-06T08:00:00Z', distance: 10000, type: 'Run' },
        { athlete_id: 3, start_date: '2026-05-12T08:00:00Z', distance: 10000, type: 'Run' },
      ],
    })

    expect(metrics[0]).toMatchObject({
      pct: 38,
      progress_value: 3,
      target_value: 8,
      progress_unit: 'member_weeks',
      completed_member_weeks: 3,
      elapsed_member_weeks: 8,
    })
  })

  it('uses elevation target units for elevation challenges', () => {
    const metrics = buildChallengeMetricsFromActivities({
      challenges: [{
        name: 'Climb Club',
        challenge_type: 'elevation',
        target_meters: 1000,
        start_date: '2026-05-01',
        end_date: '2026-05-31',
      }],
      activities: [
        { athlete_id: 1, start_date: '2026-05-05T08:00:00Z', distance: 8000, total_elevation_gain: 180, type: 'Run' },
        { athlete_id: 2, start_date: '2026-05-06T08:00:00Z', distance: 9000, total_elevation_gain: 180, type: 'Run' },
      ],
    })

    expect(metrics[0]).toMatchObject({
      pct: 36,
      progress_value: 360,
      target_value: 1000,
      progress_unit: 'meters_elevation',
    })
  })
})

describe('group signals', () => {
  it('builds a group momentum signal from canonical totals', () => {
    const signals = buildGroupSignals({
      totals: {
        week: { key: 'week', label: 'This week', range_start: '', range_end: '', unit: 'km', meters: 120000, km: 120, source_count: 12 },
        month: { key: 'month', label: 'This month', range_start: '', range_end: '', unit: 'km', meters: 0, km: 0, source_count: 0 },
        rolling_4w: { key: 'rolling_4w', label: 'Rolling 4 weeks', range_start: '', range_end: '', unit: 'km', meters: 240000, km: 240, source_count: 24 },
        rolling_12w: { key: 'rolling_12w', label: 'Rolling 12 weeks', range_start: '', range_end: '', unit: 'km', meters: 0, km: 0, source_count: 0 },
        ytd: { key: 'ytd', label: 'YTD', range_start: '', range_end: '', unit: 'km', meters: 0, km: 0, source_count: 0 },
        all_time: { key: 'all_time', label: 'All time', range_start: null, range_end: '', unit: 'km', meters: 0, km: 0, source_count: 0 },
      },
      members: [],
    })

    expect(signals[0].key).toBe('group_momentum_rising')
    expect(signals[0].evidence).toContain('120.0km')
  })
})
