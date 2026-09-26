import { describe, expect, it } from 'vitest'
import { buildGroupEngagement } from '@/lib/coachEngagement'
import type { CoachContext } from '@/lib/coachContext'

function makeCtx(overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    group: { name: 'Track Rats' },
    today: '2026-05-15',
    facts: {},
    totals: {},
    signals: [],
    members: [],
    active_challenges: [],
    ...overrides,
  } as CoachContext
}

describe('buildGroupEngagement', () => {
  it('builds challenge pressure and challenge-specific ask prompts', () => {
    const plan = buildGroupEngagement(makeCtx({
      members: [
        {
          athlete_id: 1,
          name: 'Jesse Choi',
          streak: 3, streak_label: "Rhythm streak 3 weeks",
          goals: [],
          current_estimates: [],
          this_week_km: 22,
          this_month_km: 70,
          ytd_km: 400,
          rolling_4w_km: 180,
          rolling_12w_km: 520,
          run_count_this_week: 3,
          recent_runs: [],
        },
      ],
      active_challenges: [
        {
          name: 'Climb Club',
          type: 'elevation',
          start_date: '2026-05-01',
          end_date: '2026-05-31',
          total_km: 40,
          target_km: 100,
          pct: 36,
          source_count: 6,
          progress_value: 360,
          target_value: 1000,
          progress_unit: 'meters_elevation',
        },
      ],
    }))

    expect(plan.storylines[0]).toMatchObject({
      key: 'challenge_pressure',
      evidence: '360m of 1000m climbed',
    })
    expect(plan.challenge_nudge).toContain('36%')
    expect(plan.ask_prompts[0]).toBe('How do we finish Climb Club?')
  })

  it('adds inactive member nudges and award candidates from facts', () => {
    const plan = buildGroupEngagement(makeCtx({
      members: [
        {
          athlete_id: 1,
          name: 'Mina Kim',
          streak: 1, streak_label: "Rhythm streak 1 weeks",
          goals: [],
          current_estimates: [],
          this_week_km: 30,
          this_month_km: 70,
          ytd_km: 250,
          rolling_4w_km: 120,
          rolling_12w_km: 300,
          run_count_this_week: 4,
          recent_runs: [],
        },
        {
          athlete_id: 2,
          name: 'Jesse Choi',
          streak: 0, streak_label: "Rhythm streak 0 weeks",
          goals: [],
          current_estimates: [],
          this_week_km: 0,
          this_month_km: 40,
          ytd_km: 400,
          rolling_4w_km: 90,
          rolling_12w_km: 280,
          run_count_this_week: 0,
          recent_runs: [],
        },
      ],
    }))

    expect(plan.storylines.some(s => s.key === 'nudge_list')).toBe(true)
    expect(plan.ask_prompts).toContain('Who needs a nudge today?')
    expect(plan.award_candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ athlete_name: 'Mina', award_key: 'mileage_monster' }),
      expect.objectContaining({ athlete_name: 'Jesse', award_key: 'consistency_crown' }),
    ]))
  })
})
