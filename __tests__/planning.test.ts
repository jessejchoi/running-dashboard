import { describe, it, expect } from 'vitest'
import {
  generateWeek,
  canAdapt,
  unambiguousMatches,
  validatePreferences,
  type PlanSession,
  type TrainingPreferences,
} from '@/lib/planning'
const prefs: TrainingPreferences = {
  days: [0, 1, 2, 3, 4, 5, 6],
  longRunDay: 0,
  maxMinutes: 60,
  timezone: 'Asia/Jakarta',
  easyOnly: false,
  startingWeeklyKm: 30,
  autoAdapt: true,
}
const today = '2026-09-13',
  now = new Date(today + 'T06:00:00+07:00')
function session(p: Partial<PlanSession> = {}): PlanSession {
  return {
    id: 'one',
    plan_date: '2026-09-15',
    session_index: 0,
    session_type: 'easy',
    description: '',
    target_distance_meters: 5000,
    config: null,
    source: 'coach',
    locked: false,
    status: 'planned',
    activity_id: null,
    ...p,
  }
}
describe('adaptive plan invariants', () => {
  it('protects today, manual, locked, completed and skipped workouts', () => {
    for (const s of [
      session({ plan_date: today }),
      session({ source: 'manual' }),
      session({ locked: true }),
      session({ activity_id: 123 }),
      session({ status: 'completed' }),
      session({ status: 'skipped' }),
    ])
      expect(canAdapt(s, today)).toBe(false)
  })
  it('preserves occupied dates and stays within weekly budget and availability', () => {
    const manual = session({ source: 'manual', plan_date: '2026-09-15' })
    const result = generateWeek({
      preferences: { ...prefs, days: [1, 2, 5] },
      sessions: [manual],
      runs: [],
      goals: [],
      estimates: { '10k': 3000 },
      now,
      id: () => crypto.randomUUID(),
    })
    expect(result.rows.some((r) => r.plan_date === manual.plan_date)).toBe(
      false,
    )
    expect(
      result.rows.reduce((n, r) => n + (r.target_distance_meters ?? 0), 5000),
    ).toBeLessThanOrEqual(30000)
    expect(result.rows.every((r) => r.plan_date > today)).toBe(true)
  })
  it('requires current ability when history is empty', () =>
    expect(() =>
      generateWeek({
        preferences: { ...prefs, startingWeeklyKm: 0 },
        sessions: [],
        runs: [],
        goals: [],
        estimates: {},
        now,
        id: () => '',
      }),
    ).toThrow('current weekly distance'))
  it('does not infer a completion when two workouts fit one run', () => {
    const runs = [{ id: 1, start_date: '2026-09-15T01:00:00Z', distance: 5000 }]
    expect(
      unambiguousMatches(
        [session(), session({ id: 'two' })],
        runs,
        prefs.timezone,
      ),
    ).toEqual([])
    expect(
      unambiguousMatches([session()], runs, prefs.timezone)[0].activity_id,
    ).toBe(1)
  })
  it('does not match a run already linked to another workout', () =>
    expect(
      unambiguousMatches(
        [
          session(),
          session({ id: 'done', activity_id: 1, status: 'completed' }),
        ],
        [{ id: 1, start_date: '2026-09-15T01:00:00Z', distance: 5000 }],
        prefs.timezone,
      ),
    ).toEqual([]))
  it('validates availability and timezones before generation', () =>
    expect(() =>
      validatePreferences({ ...prefs, timezone: 'invalid' }),
    ).toThrow())
})

it('respects weekly limits, rest spacing, and explicit unlinking', () => {
  const result = generateWeek({
    preferences: { ...prefs, maxWeeklyKm: 12, avoidConsecutiveDays: true },
    sessions: [],
    runs: [],
    goals: [],
    estimates: { '10k': 3000 },
    now,
    id: () => crypto.randomUUID(),
  })
  expect(
    result.rows.reduce((n, r) => n + (r.target_distance_meters ?? 0), 0),
  ).toBeLessThanOrEqual(12000)
  for (let i = 1; i < result.rows.length; i++)
    expect(
      Date.parse(result.rows[i].plan_date) -
        Date.parse(result.rows[i - 1].plan_date),
    ).toBeGreaterThan(86400000)
  expect(
    unambiguousMatches(
      [session({ matching_disabled: true })],
      [{ id: 1, start_date: '2026-09-15T01:00:00Z', distance: 5000 }],
      prefs.timezone,
    ),
  ).toEqual([])
  expect(
    unambiguousMatches(
      [session({ session_type: 'race' })],
      [
        {
          id: 1,
          start_date: '2026-09-15T01:00:00Z',
          distance: 5000,
          run_type: 'easy',
        },
      ],
      prefs.timezone,
    ),
  ).toEqual([])
})
