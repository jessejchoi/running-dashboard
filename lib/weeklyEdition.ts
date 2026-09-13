import type { CoachContext } from '@/lib/coachContext'
import { weekStart } from '@/lib/calendar'

export interface PublicPlanProgress {
  athlete_id: number
  plan_date: string
  session_type: string
  status: string
}
export interface WeeklyEdition {
  week_start: string
  as_of: string
  total_km: number
  total_runs: number
  members: Array<{
    athlete_id: number
    name: string
    km: number
    runs: number
    baseline_weekly_km: number
    completed: number
    planned: number
    next_focus: string
  }>
}

/** Only canonical group facts and public plan progress enter the edition.
 * Partial weeks are never presented as a decline against complete weeks. */
export function buildWeeklyEdition(ctx: CoachContext, plans: PublicPlanProgress[]): WeeklyEdition {
  const start = weekStart(ctx.today)
  const members = ctx.members.map(member => {
    const workouts = plans.filter(p => p.athlete_id === member.athlete_id &&
      p.plan_date >= start && p.plan_date <= ctx.today && p.session_type !== 'rest')
    const nextRace = member.goals.filter(g => Number.isFinite(g.days_to_race) && g.days_to_race >= 0)
      .sort((a, b) => a.days_to_race - b.days_to_race)[0]
    return {
      athlete_id: member.athlete_id, name: member.name,
      km: member.this_week_km, runs: member.run_count_this_week,
      baseline_weekly_km: Math.round(member.rolling_4w_km / 4 * 10) / 10,
      completed: workouts.filter(p => p.status === 'completed').length,
      planned: workouts.length,
      next_focus: nextRace
        ? `${nextRace.label}: ${nextRace.days_to_race === 0 ? 'race day today' : `${nextRace.days_to_race} days away`}. Review your personal plan for the next session.`
        : workouts.length
          ? 'Review the next session in your personal plan; missed workouts do not need catch-up mileage.'
          : 'Set your available days and goal to get a suggested personal week.',
    }
  })
  return {
    week_start: start, as_of: ctx.today,
    total_km: Math.round(members.reduce((sum, m) => sum + m.km, 0) * 10) / 10,
    total_runs: members.reduce((sum, m) => sum + m.runs, 0), members,
  }
}
