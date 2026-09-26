import { supabaseAdmin } from '@/lib/supabase'
import { loadEstimates, estimateValues } from '@/lib/estimates'
import GoalsSection from './GoalsSection'
import ExpectedEstimates from './ExpectedEstimates'
import { type DistanceUnit } from '@/lib/utils'
export default async function DashboardRaceSection({
  athleteId,
  unit,
  today,
}: {
  athleteId: number
  unit: DistanceUnit
  hasMaxHr: boolean
  today: string
}) {
  const [bundle, { data: goals }] = await Promise.all([
    loadEstimates(athleteId, { allowStaleDay: true }),
    supabaseAdmin
      .from('user_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('race_date'),
  ])
  return (
    <div className="space-y-6 my-6">
      <GoalsSection
        initialGoals={goals ?? []}
        bundle={bundle}
        estimates={estimateValues(bundle)}
        unit={unit}
        today={today}
      />
      <ExpectedEstimates estimates={bundle.estimates} deltas={bundle.deltas} />
    </div>
  )
}
