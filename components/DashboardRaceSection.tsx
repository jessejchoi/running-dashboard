import { cache } from 'react'
import { loadEstimates, estimateValues } from '@/lib/estimates'
import { type UserGoal } from '@/lib/goals'
import GoalsSection from './GoalsSection'
import ExpectedEstimates from './ExpectedEstimates'
import { type DistanceUnit } from '@/lib/utils'

/** One estimate load per dashboard request, shared by the race block and this section. */
export const dashboardEstimates = cache((athleteId: number) =>
  loadEstimates(athleteId, { allowStaleDay: true }),
)

export default async function DashboardRaceSection({
  athleteId,
  goals,
  unit,
}: {
  athleteId: number
  goals: UserGoal[]
  unit: DistanceUnit
}) {
  const bundle = await dashboardEstimates(athleteId)
  return (
    <div className="space-y-3 my-3">
      <GoalsSection
        initialGoals={goals}
        bundle={bundle}
        estimates={estimateValues(bundle)}
        unit={unit}
        n="08"
      />
      <ExpectedEstimates estimates={bundle.estimates} deltas={bundle.deltas} n="09" />
    </div>
  )
}
