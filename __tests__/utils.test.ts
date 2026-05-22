import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { computeStreak, getWeekStart, isoWeek } from '@/lib/utils'

// Today is 2026-03-18 (Wednesday) per system context.
// Jakarta (UTC+7) week boundaries (Mon-Sun):
//   This week:   Mon 2026-03-16 00:00 JKT = 2026-03-15T17:00:00Z
//   Last week:   Mon 2026-03-09 00:00 JKT = 2026-03-08T17:00:00Z
//   2 weeks ago: Mon 2026-03-02 00:00 JKT = 2026-03-01T17:00:00Z
//   3 weeks ago: Mon 2026-02-23 00:00 JKT = 2026-02-22T17:00:00Z

const NOW_UTC = new Date('2026-03-18T10:00:00Z') // Wed Mar 18, 5pm Jakarta

// Run timestamps within each week (well within boundaries)
const THIS_WEEK_RUN = '2026-03-17T05:00:00Z'  // Tue Mar 17, 12pm Jakarta
const LAST_WEEK_RUN = '2026-03-10T05:00:00Z'  // Tue Mar 10, 12pm Jakarta
const TWO_WEEKS_AGO  = '2026-03-03T05:00:00Z'  // Tue Mar 3, 12pm Jakarta
const THREE_WEEKS_AGO = '2026-02-24T05:00:00Z' // Tue Feb 24, 12pm Jakarta

describe('computeStreak', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_UTC)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('1. empty runs → 0', () => {
    expect(computeStreak([], 1)).toBe(0)
  })

  it('2. only this week → 1', () => {
    const runs = [{ start_date: THIS_WEEK_RUN, athlete_id: 1 }]
    expect(computeStreak(runs, 1)).toBe(1)
  })

  it('3. this week + last week → 2', () => {
    const runs = [
      { start_date: THIS_WEEK_RUN, athlete_id: 1 },
      { start_date: LAST_WEEK_RUN, athlete_id: 1 },
    ]
    expect(computeStreak(runs, 1)).toBe(2)
  })

  it('4. three consecutive weeks → 3', () => {
    const runs = [
      { start_date: THIS_WEEK_RUN, athlete_id: 1 },
      { start_date: LAST_WEEK_RUN, athlete_id: 1 },
      { start_date: TWO_WEEKS_AGO, athlete_id: 1 },
    ]
    expect(computeStreak(runs, 1)).toBe(3)
  })

  it('5. gap week (this week + two weeks ago, no last week) → 1', () => {
    const runs = [
      { start_date: THIS_WEEK_RUN, athlete_id: 1 },
      { start_date: TWO_WEEKS_AGO, athlete_id: 1 },
    ]
    expect(computeStreak(runs, 1)).toBe(1)
  })

  it('6. ran last week but not this week → streak counts from last week (1)', () => {
    const runs = [{ start_date: LAST_WEEK_RUN, athlete_id: 1 }]
    expect(computeStreak(runs, 1)).toBe(1)
  })

  it('7. ran 2 weeks ago only → 0 (no active streak)', () => {
    const runs = [{ start_date: TWO_WEEKS_AGO, athlete_id: 1 }]
    expect(computeStreak(runs, 1)).toBe(0)
  })

  it('8. Jakarta late-night: run at 2026-03-16T17:00:00Z (Mon Mar 16 midnight Jakarta) belongs to this week', () => {
    // 2026-03-16T17:00:00Z = Mon Mar 16 2026 00:00:00 WIB (start of Jakarta week)
    const runs = [{ start_date: '2026-03-16T17:00:00Z', athlete_id: 1 }]
    expect(computeStreak(runs, 1)).toBe(1)
  })

  it('9. multiple runs same week → still counts as 1', () => {
    const runs = [
      { start_date: THIS_WEEK_RUN, athlete_id: 1 },
      { start_date: '2026-03-18T05:00:00Z', athlete_id: 1 },
      { start_date: '2026-03-19T05:00:00Z', athlete_id: 1 },
    ]
    expect(computeStreak(runs, 1)).toBe(1)
  })

  it('10. filter by athleteId: runs from other athletes do not count', () => {
    const runs = [
      { start_date: THIS_WEEK_RUN, athlete_id: 2 },
      { start_date: LAST_WEEK_RUN, athlete_id: 2 },
      { start_date: LAST_WEEK_RUN, athlete_id: 1 },
    ]
    // Athlete 1 only has last week → streak of 1 (last week is active)
    expect(computeStreak(runs, 1)).toBe(1)
    // Athlete 2 has this week + last week → streak of 2
    expect(computeStreak(runs, 2)).toBe(2)
  })
})

describe('weekly date helpers', () => {
  it('uses Jakarta Monday midnight for week keys', () => {
    expect(isoWeek(new Date('2026-03-15T16:59:59Z'))).toBe('2026-03-09')
    expect(isoWeek(new Date('2026-03-15T17:00:00Z'))).toBe('2026-03-16')
    expect(isoWeek(new Date('2026-03-22T16:59:59Z'))).toBe('2026-03-16')
    expect(isoWeek(new Date('2026-03-22T17:00:00Z'))).toBe('2026-03-23')
  })

  it('returns the actual UTC instant for local week start', () => {
    expect(getWeekStart(new Date('2026-03-18T10:00:00Z')).toISOString()).toBe('2026-03-15T17:00:00.000Z')
  })
})
