import { expect, it, vi } from 'vitest'
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: { from: vi.fn() } }))
vi.mock('@/lib/stravaBudget', () => ({ importMayRun: vi.fn(), stravaFetch: vi.fn() }))
vi.mock('@/lib/jobs', () => ({ enqueueJob: vi.fn() }))
import { calculateTrainingLoad, runTrainingLoad } from '@/lib/strava'
import { stravaTimezone } from '@/lib/calendar'

it('buckets runs by the local day, not the UTC day', () => {
  // 06:03 on Sep 26 in Jakarta is 23:03 on Sep 25 UTC.
  const points = calculateTrainingLoad(
    [{ start_date: '2026-09-25T23:03:06+00:00', moving_time: 3600, average_heartrate: 150 }],
    { maxHr: 196, timezone: 'Asia/Jakarta', today: '2026-09-26' }
  )
  expect(points.map(p => p.date)).toEqual(['2026-09-26'])
  expect(points[0].load).toBeGreaterThan(0)
})

it('uses each run\'s own local date and the latest run\'s timezone for today', () => {
  // A 5am Jakarta run, then a 9pm Los Angeles run the same local day (Sep 26 in UTC and Jakarta).
  const runs = [
    { start_date: '2026-09-24T22:00:00Z', start_date_local: '2026-09-25T05:00:00Z', timezone: '(GMT+07:00) Asia/Jakarta', moving_time: 3600 },
    { start_date: '2026-09-26T04:00:00Z', start_date_local: '2026-09-25T21:00:00Z', timezone: '(GMT-08:00) America/Los_Angeles', moving_time: 3600 },
  ]
  const points = calculateTrainingLoad(runs, { today: '2026-09-25' })
  expect(points.map(p => [p.date, p.load > 0])).toEqual([['2026-09-25', true]])
  expect(points[0].load).toBe(runTrainingLoad(runs[0]) * 2)
})

it('parses Strava timezone labels', () => {
  expect(stravaTimezone('(GMT-08:00) America/Los_Angeles')).toBe('America/Los_Angeles')
  expect(stravaTimezone('(GMT+00:00) Not/AZone')).toBeNull()
  expect(stravaTimezone(null)).toBeNull()
})

it('counts an easy run as real load, not a near-rest day', () => {
  // 46 min at 130 bpm: Strava Relative Effort scored this 11.
  const easy = runTrainingLoad({ moving_time: 46 * 60, average_heartrate: 129.7 }, 196)
  const hard = runTrainingLoad({ moving_time: 104 * 60, average_heartrate: 158.5 }, 196)
  expect(easy).toBeGreaterThanOrEqual(35)
  expect(hard / easy).toBeLessThan(5)
})

it('keeps fatigue rising across back-to-back easy days after rest', () => {
  const runs = ['2026-09-01', '2026-09-02', '2026-09-03'].map(d => ({
    start_date: `${d}T00:00:00+00:00`, moving_time: 45 * 60, average_heartrate: 135,
  }))
  const points = calculateTrainingLoad(runs, { maxHr: 196, today: '2026-09-03' })
  expect(points).toHaveLength(3)
  expect(points[1].atl).toBeGreaterThan(points[0].atl)
  expect(points[2].atl).toBeGreaterThan(points[1].atl)
})
