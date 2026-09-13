import { supabaseAdmin } from '@/lib/supabase'
import { loadEstimates, estimateValues } from '@/lib/estimates'
import GoalsSection from './GoalsSection'
import ExpectedEstimates from './ExpectedEstimates'
import { type DistanceUnit } from '@/lib/utils'
export default async function DashboardRaceSection({
  athleteId,
  unit,
}: {
  athleteId: number
  unit: DistanceUnit
  hasMaxHr: boolean
}) {
  const [bundle, { data: goals }] = await Promise.all([
    loadEstimates(athleteId),
    supabaseAdmin
      .from('user_goals')
      .select('*')
      .eq('athlete_id', athleteId)
      .order('race_date'),
  ])
  return (
    <div className="space-y-6 my-6">
      <ExpectedEstimates estimates={bundle.estimates} />
      <GoalsSection
        initialGoals={goals ?? []}
        bundle={bundle}
        estimates={estimateValues(bundle)}
        unit={unit}
      />
    </div>
  )
}
