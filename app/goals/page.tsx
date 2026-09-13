import { getAthleteId } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import Nav from '@/components/Nav'
import GoalsSection from '@/components/GoalsSection'
import TrainingGoals from '@/components/TrainingGoals'
import ExpectedEstimates from '@/components/ExpectedEstimates'
import { loadEstimates, estimateValues } from '@/lib/estimates'
import { trainingGoals } from '@/lib/trainingGoals'
import { type DistanceUnit } from '@/lib/utils'
export default async function GoalsPage() {
  const id = await getAthleteId()
  if (!id) redirect('/')
  const [{ data: goals }, bundle, weekly] = await Promise.all([
    supabaseAdmin
      .from('user_goals')
      .select('*')
      .eq('athlete_id', id)
      .order('race_date'),
    loadEstimates(Number(id)),
    trainingGoals(Number(id)),
  ])
  return (
    <>
      <Nav />
      <main className="max-w-6xl mx-auto px-3 sm:px-6 pt-8 sm:pt-20 pb-24 space-y-6">
        <h1 className="font-display text-3xl font-bold uppercase">
          Your goals
        </h1>
        <GoalsSection
          initialGoals={goals ?? []}
          bundle={bundle}
          estimates={estimateValues(bundle)}
          unit={(cookies().get('unit_pref')?.value ?? 'km') as DistanceUnit}
        />
        <TrainingGoals initial={weekly} />
        <ExpectedEstimates estimates={bundle.estimates} />
      </main>
    </>
  )
}
